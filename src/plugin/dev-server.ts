import type { ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'pathe'

export interface ResolvedCerConfig {
  mode: 'spa' | 'ssr' | 'ssg'
  srcDir: string
  root: string
  pagesDir: string
  layoutsDir: string
  componentsDir: string
  composablesDir: string
  pluginsDir: string
  middlewareDir: string
  serverApiDir: string
  serverMiddlewareDir: string
  port: number
  ssr: { dsd: boolean }
  ssg: { routes: 'auto' | string[]; concurrency: number; fallback: boolean }
  router: { base?: string; scrollToFragment?: boolean | object }
  jitCss: { content: string[]; extendedColors: boolean }
  autoImports: { components: boolean; composables: boolean; directives: boolean; runtime: boolean }
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

    // 1. Server middleware from server/middleware/ runs first (CORS, auth, logging, etc.)
    try {
      const smMod = await server.ssrLoadModule('virtual:cer-server-middleware')
      const serverMiddleware = (smMod.serverMiddleware ?? smMod.default ?? []) as Array<{
        name: string
        handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void | Promise<void>
      }>

      for (const { handler } of serverMiddleware) {
        if (typeof handler === 'function') {
          let calledNext = false
          await handler(req, res, () => {
            calledNext = true
          })
          if (!calledNext) return
        }
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

    // 3. SSR mode: intercept HTML requests
    if (config.mode === 'ssr') {
      const acceptsHtml =
        (req.headers['accept'] ?? '').includes('text/html') ||
        url === '/' ||
        (!url.includes('.') && !url.startsWith('/api/'))

      if (acceptsHtml) {
        try {
          // Load the SSR entry module
          const ssrEntry = await server.ssrLoadModule(
            resolve(config.srcDir, 'entry-server.ts'),
          )

          const handler =
            ssrEntry.handler ?? ssrEntry.default?.handler

          if (typeof handler === 'function') {
            await handler(req, res)
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
