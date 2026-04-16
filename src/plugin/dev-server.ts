import type { ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { join } from 'pathe'
import { getGeneratedDir } from './generated-dir.js'

export interface ResolvedCerConfig {
  mode: 'spa' | 'ssr' | 'ssg'
  srcDir: string
  root: string
  contentDir: string
  pagesDir: string
  layoutsDir: string
  componentsDir: string
  composablesDir: string
  pluginsDir: string
  middlewareDir: string
  serverApiDir: string
  serverMiddlewareDir: string
  port: number
  ssg: { routes: 'auto' | string[]; concurrency: number; fallback: boolean }
  router: { base?: string; scrollToFragment?: boolean | object }
  jitCss: { content: string[]; extendedColors: boolean; customColors?: Record<string, Record<string, string>> }
  autoImports: { components: boolean; composables: boolean; directives: boolean; runtime: boolean }
  runtimeConfig: { public: Record<string, unknown>; private: import('../types/config.js').RuntimePrivateConfig }
  auth: import('../types/config.js').AuthConfig | null
  i18n: { locales: string[]; defaultLocale: string; strategy: 'prefix' | 'prefix_except_default' | 'no_prefix' } | null
}

/**
 * Reads the raw body from an IncomingMessage as a Buffer.
 */
function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Parses the request body for JSON content types.
 * Attaches the parsed body (or raw buffer) to `(req as any).body`.
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  const contentType = req.headers['content-type'] ?? ''
  const method = req.method?.toUpperCase() ?? 'GET'

  if (!['POST', 'PUT', 'PATCH'].includes(method)) {
    return undefined
  }

  const buf = await readBody(req)

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(buf.toString('utf-8'))
    } catch {
      return undefined
    }
  }

  return buf
}

/**
 * Extracts route params from a path pattern.
 * e.g. pattern="/api/users/:id", path="/api/users/42" -> { id: "42" }
 */
function matchApiPath(
  pattern: string,
  urlPath: string,
): Record<string, string> | null {
  const patternParts = pattern.split('/')
  const urlParts = urlPath.split('?')[0].split('/')

  if (patternParts.length !== urlParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]
    const u = urlParts[i]
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(u)
    } else if (p !== u) {
      return null
    }
  }

  return params
}

/**
 * Parses URL query string into a plain object.
 */
function parseQuery(url: string): Record<string, string> {
  const qIndex = url.indexOf('?')
  if (qIndex === -1) return {}
  const qs = url.slice(qIndex + 1)
  const result: Record<string, string> = {}
  for (const part of qs.split('&')) {
    if (!part) continue
    const eqIdx = part.indexOf('=')
    if (eqIdx === -1) {
      result[decodeURIComponent(part)] = ''
    } else {
      result[decodeURIComponent(part.slice(0, eqIdx))] = decodeURIComponent(
        part.slice(eqIdx + 1),
      )
    }
  }
  return result
}

/**
 * Tests whether a route path pattern matches a URL path.
 * Mirrors the logic in preview-isr.ts#matchRoutePattern — kept local to
 * avoid a plugin→CLI dependency.
 */
function _matchDevRoute(pattern: string, urlPath: string): boolean {
  const norm = (s: string) => s.replace(/\/+$/, '') || '/'
  if (norm(pattern) === norm(urlPath)) return true
  const regexStr =
    '^' +
    norm(pattern)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:[^/]+\*/g, '.*')
      .replace(/:[^/]+/g, '[^/]+') +
    '$'
  return new RegExp(regexStr).test(norm(urlPath))
}

function _isHtmlRequest(url: string, acceptHeader: string | string[] | undefined): boolean {
  const accept = Array.isArray(acceptHeader) ? acceptHeader.join(',') : (acceptHeader ?? '')
  if (url.startsWith('/api/') || url.startsWith('/@')) return false
  return (
    accept.includes('text/html') ||
    url === '/' ||
    url === '/index.html' ||
    !url.includes('.')
  )
}

async function _serveSpaShell(
  server: ViteDevServer,
  config: ResolvedCerConfig,
  url: string,
  res: ServerResponse,
): Promise<boolean> {
  const userHtml = resolve(config.root, 'index.html')
  const cerHtml = join(getGeneratedDir(config.root), 'index.html')
  const shellPath = existsSync(userHtml) ? userHtml : cerHtml
  if (!existsSync(shellPath)) return false

  const rawHtml = readFileSync(shellPath, 'utf-8')
  const transformed = await server.transformIndexHtml(url, rawHtml)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.statusCode = 200
  res.end(transformed)
  return true
}

/**
 * Configures the Vite dev server with:
 * 1. API route handlers from server/api/
 * 2. Server middleware from server/middleware/
 * 3. SSR HTML rendering (when mode is 'ssr')
 */
export function configureCerDevServer(
  server: ViteDevServer,
  config: ResolvedCerConfig,
): void {
  server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '/'
    const method = req.method?.toUpperCase() ?? 'GET'
    const acceptsHtml = _isHtmlRequest(url, req.headers['accept'])

    // 1. Server middleware from server/middleware/ runs first (CORS, auth, logging, etc.)
    try {
      const smMod = await server.ssrLoadModule('virtual:cer-server-middleware')
      const serverMiddleware = (smMod.serverMiddleware ?? smMod.default ?? []) as Array<{
        name: string
        handler: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void | Promise<void>
      }>

      for (const { handler } of serverMiddleware) {
        if (typeof handler !== 'function') continue
        let calledNext = false
        try {
          await new Promise<void>((resolve, reject) => {
            Promise.resolve(handler(req, res, (err?: unknown) => {
              if (err) reject(err)
              else { calledNext = true; resolve() }
            })).then(() => { if (!calledNext) resolve() }).catch(reject)
          })
        } catch {
          if (!res.writableEnded) { res.statusCode = 500; res.end('Internal Server Error') }
          return
        }
        if (res.writableEnded || !calledNext) return
      }
    } catch {
      // middleware module not ready — continue
    }

    // 2. API route handlers from server/api/
    try {
      const mod = await server.ssrLoadModule('virtual:cer-server-api')
      const apiRoutes: Array<{ path: string; handlers: Record<string, unknown> }> =
        mod.apiRoutes ?? mod.default?.apiRoutes ?? []

      for (const route of apiRoutes) {
        const params = matchApiPath(route.path, url.split('?')[0])
        if (params === null) continue

        const query = parseQuery(url)
        const body = await parseBody(req)

        // Augment request
        const augmentedReq = req as IncomingMessage & {
          params: Record<string, string>
          query: Record<string, string>
          body: unknown
        }
        augmentedReq.params = params
        augmentedReq.query = query
        augmentedReq.body = body

        // Augment response with json() and status() helpers
        const augmentedRes = res as ServerResponse & {
          json(data: unknown): void
          status(code: number): typeof augmentedRes
          _statusCode?: number
        }

        augmentedRes.json = function (data: unknown) {
          const json = JSON.stringify(data)
          this.setHeader('Content-Type', 'application/json')
          this.end(json)
        }

        augmentedRes.status = function (code: number) {
          this.statusCode = code
          return this
        }

        // Try to find a handler for the HTTP method. Exports may be GET/POST (uppercase)
        // or get/post (lowercase); try both plus a 'default' fallback.
        type RouteHandlerFn = (req: typeof augmentedReq, res: typeof augmentedRes) => void | Promise<void>
        const handlerKey = method.toLowerCase()
        const handler =
          (route.handlers[handlerKey] as RouteHandlerFn | undefined) ??
          (route.handlers[method.toUpperCase()] as RouteHandlerFn | undefined) ??
          (route.handlers['default'] as RouteHandlerFn | undefined)

        if (typeof handler === 'function') {
          try {
            await handler(augmentedReq, augmentedRes)
          } catch (err) {
            server.ssrFixStacktrace(err as Error)
            console.error(`[cer-app] API handler error at ${route.path}:`, err)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Internal Server Error' }))
          }
          return
        }
      }
    } catch {
      // virtual:cer-server-api not yet ready or empty — continue
    }

    // 3. SPA mode: answer client-routed HTML navigations with the shell directly
    // so Vite's history fallback never emits an intermediate 404 for valid app routes.
    if (config.mode === 'spa' && (method === 'GET' || method === 'HEAD') && acceptsHtml) {
      if (await _serveSpaShell(server, config, url, res)) {
        return
      }
    }

    // 4. SSR/SSG mode: intercept HTML requests and server-render them.
    // Both 'ssr' and 'ssg' modes run loaders on the server so usePageData()
    // returns real data during dev — matching production behaviour.
    // 'spa' mode never runs server loaders, so it falls through to the client bundle.
    if (config.mode === 'ssr' || config.mode === 'ssg') {
      if (acceptsHtml) {
        // Check per-route render mode — skip SSR for 'spa' routes.
        const urlPathOnly = url.split('?')[0]
        try {
          const routesMod = await server.ssrLoadModule('virtual:cer-routes')
          const pageRoutes = Array.isArray(routesMod.default) ? routesMod.default as Array<{ path: string; meta?: Record<string, unknown> }> : []
          for (const route of pageRoutes) {
            if (_matchDevRoute(route.path, urlPathOnly)) {
              if (route.meta?.render === 'spa') {
                // In SSR/SSG dev mode, a route with render:'spa' should be served as
                // the SPA shell (no server rendering). Serve .cer/index.html so the
                // client bundle boots and handles the route client-side.
                if (await _serveSpaShell(server, config, url, res)) {
                  return
                }
                next()
                return
              }
              break
            }
          }
        } catch { /* module not ready — continue to SSR */ }
        try {
          // Load the SSR entry module from .cer/entry-server.ts (written by
          // writeGeneratedDir). The production build uses a virtual plugin for
          // the same template; the dev server needs a real file on disk.
          const ssrEntry = await server.ssrLoadModule(
            join(getGeneratedDir(config.root), 'entry-server.ts'),
          )

          const handler =
            ssrEntry.handler ?? ssrEntry.default?.handler

          if (typeof handler === 'function') {
            // In dev mode _clientTemplate inside entry-server.ts is null because
            // the dist/client/index.html path doesn't exist. Set the global that
            // the handler reads per-request so the SSR response includes the
            // Vite client scripts (/@vite/client, HMR, module imports for app.ts).
            const _userIndexPath = resolve(config.root, 'index.html')
            const _genIndexPath = join(getGeneratedDir(config.root), 'index.html')
            const _rawHtml = existsSync(_userIndexPath)
              ? readFileSync(_userIndexPath, 'utf-8')
              : existsSync(_genIndexPath)
                ? readFileSync(_genIndexPath, 'utf-8')
                : null
            if (_rawHtml) {
              ;(globalThis as Record<string, unknown>).__CER_CLIENT_TEMPLATE__ =
                await server.transformIndexHtml(url, _rawHtml)
            }
            try {
              await handler(req, res)
            } finally {
              ;(globalThis as Record<string, unknown>).__CER_CLIENT_TEMPLATE__ = undefined
            }
            return
          }

          // Fallback: render using template + ssrEntry render function
          const renderFn = ssrEntry.render ?? ssrEntry.default?.render

          if (typeof renderFn === 'function') {
            const template = await server.transformIndexHtml(
              url,
              `<!DOCTYPE html><html><head></head><body><div id="app"></div></body></html>`,
            )

            const result = await renderFn({ url, req })
            const rendered = template.replace(
              '<div id="app"></div>',
              `<div id="app">${result.html ?? ''}</div>`,
            )

            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(rendered)
            return
          }
        } catch (err) {
          server.ssrFixStacktrace(err as Error)
          console.error('[cer-app] SSR render error:', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'text/plain')
          res.end('SSR Error: ' + String(err))
          return
        }
      }
    }

    next()
  })
}
