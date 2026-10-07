import type { IncomingMessage, ServerResponse } from 'node:http'
import { findRenderMode, findRevalidate } from './route-matching.js'
import { createIsrHandler, type SsrHandlerFn } from './isr-handler.js'

export interface ServerApplication {
  handler: SsrHandlerFn
  spaHandler?: SsrHandlerFn
  routes?: Array<{ path: string; meta?: Record<string, unknown> }>
  apiRoutes?: Array<{ path: string; handlers: Record<string, unknown> }>
  runServerMiddleware?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>
  runWithRequestContext?: <T>(req: IncomingMessage, res: ServerResponse, fn: () => Promise<T>) => Promise<T>
}

export interface DispatcherOptions {
  /** Known SSG documents. The transport supplies disk or platform asset access. */
  prerendered?: {
    paths: readonly string[]
    read: (path: string, req: IncomingMessage) => string | null | Promise<string | null>
    /** False for hybrid SSG builds that deliberately reject ungenerated static routes. */
    fallback?: boolean
    notFound?: (req: IncomingMessage) => string | null | Promise<string | null>
  }
}

export function normalizeDocumentPath(path: string): string {
  let decoded: string
  try { decoded = decodeURIComponent(path) } catch { throw Object.assign(new Error('Invalid URL encoding'), { statusCode: 400 }) }
  if (!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some((part) => part === '.' || part === '..')) {
    throw Object.assign(new Error('Invalid URL path'), { statusCode: 400 })
  }
  return decoded.replace(/\/+$/, '') || '/'
}

export function isPrivateBuildPath(path: string): boolean {
  return /^\/(?:server|client|\.vite)(?:\/|$)/.test(path) || /^\/(?:ssg-manifest|cer-client-manifest|cer-startup-manifest)\.json$/.test(path)
}

function matchApiPattern(pattern: string, urlPath: string): Record<string, string> | null {
  const patternParts = pattern.split('/')
  const urlParts = urlPath.split('/')
  if (patternParts.length !== urlParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]
    const u = urlParts[i]
    if (p.startsWith(':')) {
      try { params[p.slice(1)] = decodeURIComponent(u) }
      catch { throw Object.assign(new Error('Invalid route parameter'), { statusCode: 400 }) }
    } else if (p !== u) {
      return null
    }
  }
  return params
}


async function parseBody(req: IncomingMessage): Promise<unknown> {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method ?? 'GET')) return undefined
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > 1024 * 1024) throw Object.assign(new Error('Request body too large'), { statusCode: 413 })
    chunks.push(bytes)
  }
  const bytes = Buffer.concat(chunks)
  if (!bytes.length) return undefined
  if (String(req.headers['content-type'] ?? '').includes('application/json')) {
    try { return JSON.parse(bytes.toString('utf8')) } catch { throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 }) }
  }
  return bytes
}

/** Common CER routing semantics; transport adapters supply Node-compatible requests/responses. */
export function createRequestDispatcher(app: ServerApplication, options: DispatcherOptions = {}): SsrHandlerFn {
  const render = createIsrHandler(app.routes ?? [], app.handler)
  const paths = new Set(options.prerendered?.paths.map(normalizeDocumentPath))
  return async (req, res) => {
    const dispatch = async () => {
      try {
        const url = new URL(req.url ?? '/', 'http://cer.local')
        const path = normalizeDocumentPath(url.pathname)
        if (isPrivateBuildPath(path)) { res.statusCode = 404; res.end('Not Found'); return }
        if (app.runServerMiddleware && !(await app.runServerMiddleware(req, res))) return
        if (!url.pathname.startsWith('/api/')) {
          const mode = findRenderMode(app.routes ?? [], path)
          if (mode === 'spa' && app.spaHandler) await app.spaHandler(req, res)
          else if (['GET', 'HEAD'].includes(req.method ?? 'GET') && mode !== 'server' && findRevalidate(app.routes ?? [], path) === null && paths.has(path)) {
            const html = await options.prerendered!.read(path, req)
            if (html === null) throw new Error(`Missing prerendered document: ${path}`)
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-cache')
            res.end(req.method === 'HEAD' ? undefined : html)
          } else if (options.prerendered?.fallback === false && mode !== 'server' && findRevalidate(app.routes ?? [], path) === null && !paths.has(path)) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            const html = await options.prerendered.notFound?.(req) ?? '<!doctype html><meta name="robots" content="noindex"><title>Not found</title><h1>Not found</h1>'
            res.end(req.method === 'HEAD' ? undefined : html)
          } else await render(req, res)
          return
        }
        for (const route of app.apiRoutes ?? []) {
          const params = matchApiPattern(route.path, url.pathname)
          if (!params) continue
          const method = (req.method ?? 'GET').toLowerCase()
          const fn = route.handlers[method] ?? route.handlers[method.toUpperCase()] ?? (method === 'head' ? route.handlers.get ?? route.handlers.GET : undefined) ?? route.handlers.default
          if (typeof fn !== 'function') {
            res.statusCode = 405
            res.setHeader('Allow', Object.keys(route.handlers).filter((key) => key !== 'default').map((key) => key.toUpperCase()).join(', '))
            res.end('Method Not Allowed'); return
          }
          Object.assign(req, { params, query: Object.fromEntries(url.searchParams), body: await parseBody(req) })
          Object.assign(res, {
            json(data: unknown) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)) },
            status(code: number) { res.statusCode = code; return res },
          })
          await fn(req, res)
          return
        }
        res.statusCode = 404; res.end('Not Found')
      } catch (error) {
        if (res.headersSent) { res.end(); return }
        const code = (error as { statusCode?: number }).statusCode
        res.statusCode = code === 400 || code === 413 ? code : 500
        res.end(res.statusCode === 500 ? 'Internal Server Error' : (error as Error).message)
      }
    }
    try { await (app.runWithRequestContext ? app.runWithRequestContext(req, res, dispatch) : dispatch()) }
    catch { if (!res.headersSent) { res.statusCode = 500; res.end('Internal Server Error') } else res.end() }
  }
}
