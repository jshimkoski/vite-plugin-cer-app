/**
 * createIsrHandler — portable stale-while-revalidate ISR factory.
 *
 * Wraps any Express-compatible SSR handler with an in-memory ISR cache.
 * Routes that export `meta.ssg.revalidate` get cached for the declared TTL.
 *
 * Usage (Express):
 *   import { createIsrHandler } from '@jasonshimmy/vite-plugin-cer-app/isr'
 *   import { handler, routes } from './dist/server/server.js'
 *   app.use(createIsrHandler(routes, handler))
 *
 * Usage (Hono):
 *   import { createIsrHandler } from '@jasonshimmy/vite-plugin-cer-app/isr'
 *   import { handler, routes } from './dist/server/server.js'
 *   app.use('*', createIsrHandler(routes, handler))
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** A single cached SSR response stored by `createIsrHandler`. Includes the full rendered HTML, response headers, status code, and revalidation metadata. */
export interface IsrCacheEntry {
  html: string
  headers: Record<string, string>
  statusCode: number
  builtAt: number
  revalidate: number
}

/** The SSR request handler signature produced by the server entry bundle (exported as `handler`). Compatible with Express, Hono, and any Node.js HTTP server. */
export type SsrHandlerFn = (req: IncomingMessage, res: ServerResponse) => unknown

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _matchPattern(pattern: string, urlPath: string): boolean {
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

function _findRevalidate(
  routes: Array<{ path: string; meta?: Record<string, unknown> }>,
  urlPath: string,
): number | null {
  for (const route of routes) {
    if (_matchPattern(route.path, urlPath)) {
      const ssg = route.meta?.ssg as Record<string, unknown> | undefined
      if (typeof ssg?.revalidate === 'number') return ssg.revalidate
      return null
    }
  }
  return null
}

async function _renderForCache(
  urlPath: string,
  handler: SsrHandlerFn,
  revalidate: number,
): Promise<IsrCacheEntry | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    const capturedHeaders: Record<string, string | string[]> = {}
    let capturedStatus = 200

    const fakeRes = {
      get statusCode() { return capturedStatus },
      set statusCode(v: number) { capturedStatus = v },
      setHeader(name: string, value: string | string[]) {
        capturedHeaders[name.toLowerCase()] = value
      },
      write(chunk: string | Buffer) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf-8'))
      },
      end(body?: string | Buffer) {
        if (body !== undefined) {
          chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf-8'))
        }
        resolve({
          html: Buffer.concat(chunks).toString('utf-8'),
          headers: Object.fromEntries(
            Object.entries(capturedHeaders).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]),
          ),
          statusCode: capturedStatus,
          builtAt: Date.now(),
          revalidate,
        })
      },
    } as unknown as ServerResponse

    const fakeReq = {
      url: urlPath,
      method: 'GET',
      headers: { accept: 'text/html' },
    } as IncomingMessage

    try {
      const result = handler(fakeReq, fakeRes)
      if (result && typeof (result as Promise<void>).catch === 'function') {
        ;(result as Promise<void>).catch(() => resolve(null))
      }
    } catch {
      resolve(null)
    }
  })
}

function _serveFromCache(entry: IsrCacheEntry, res: ServerResponse, status: 'HIT' | 'STALE'): void {
  res.statusCode = entry.statusCode
  for (const [name, value] of Object.entries(entry.headers)) {
    res.setHeader(name, value)
  }
  res.setHeader('X-Cache', status)
  res.end(entry.html)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Wraps an SSR handler with stale-while-revalidate ISR caching.
 *
 * Routes that declare `meta.ssg.revalidate` in the `routes` array are cached
 * in memory. After the TTL expires the stale response is served immediately
 * while a fresh render runs in the background (stale-while-revalidate).
 *
 * Routes without a `revalidate` value are passed through to the handler directly.
 */
export function createIsrHandler(
  routes: Array<{ path: string; meta?: Record<string, unknown> }>,
  handler: SsrHandlerFn,
): SsrHandlerFn {
  const cache = new Map<string, IsrCacheEntry>()
  // True lock: stores the in-flight revalidation Promise per URL path.
  // A path present in this map means a background render is already in progress.
  const _inFlight = new Map<string, Promise<void>>()

  return async (req: IncomingMessage, res: ServerResponse): Promise<unknown> => {
    const urlPath = (req.url ?? '/').split('?')[0]
    const revalidate = _findRevalidate(routes, urlPath)

    if (revalidate === null) {
      return handler(req, res)
    }

    const cached = cache.get(urlPath)
    const now = Date.now()

    if (cached) {
      const ageSeconds = (now - cached.builtAt) / 1000
      if (ageSeconds < cached.revalidate) {
        _serveFromCache(cached, res, 'HIT')
        return
      }
      // Stale — serve immediately, then revalidate in the background if no
      // revalidation is already in flight for this path.
      _serveFromCache(cached, res, 'STALE')
      if (!_inFlight.has(urlPath)) {
        const promise = _renderForCache(urlPath, handler, revalidate).then((entry) => {
          if (entry) cache.set(urlPath, entry)
        }).catch(() => {
          // Background render failed — next request will try again.
        }).finally(() => {
          _inFlight.delete(urlPath)
        })
        _inFlight.set(urlPath, promise)
      }
      return
    }

    // Cache miss — render, cache, then serve.
    const entry = await _renderForCache(urlPath, handler, revalidate)
    if (entry) {
      cache.set(urlPath, entry)
      _serveFromCache(entry, res, 'HIT')
    } else {
      await handler(req, res)
    }
  }
}
