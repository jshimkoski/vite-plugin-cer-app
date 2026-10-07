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
 * Web Request/Response frameworks require a transport bridge; this factory
 * accepts Node.js IncomingMessage/ServerResponse objects.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import { matchRoutePattern as _matchPattern, findRevalidate as _findRevalidate } from './route-matching.js'

/** A single cached SSR response stored by `createIsrHandler`. Includes the full rendered HTML, response headers, status code, and revalidation metadata. */
export interface IsrCacheEntry {
  html: string
  headers: Record<string, string | string[]>
  statusCode: number
  builtAt: number
  revalidate: number
}

/** The Node.js request handler signature produced by the server entry bundle. Web Request/Response frameworks require a bridge. */
export type SsrHandlerFn = (req: IncomingMessage, res: ServerResponse) => unknown

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _renderForCache(
  urlPath: string,
  handler: SsrHandlerFn,
  revalidate: number,
  request: IncomingMessage,
): Promise<IsrCacheEntry | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 30_000)
    timer.unref?.()
    const finish = (entry: IsrCacheEntry | null) => { clearTimeout(timer); resolve(entry) }
    const chunks: Buffer[] = []
    const capturedHeaders: Record<string, string | string[]> = {}
    let capturedStatus = 200

    const events = new EventEmitter()
    const fakeRes = Object.assign(events, {
      headersSent: false,
      writableEnded: false,
      getHeader(name: string) { return capturedHeaders[name.toLowerCase()] },
      getHeaders() { return { ...capturedHeaders } },
      removeHeader(name: string) { delete capturedHeaders[name.toLowerCase()] },
      writeHead(status: number, headers?: Record<string, string>) { capturedStatus = status; Object.assign(capturedHeaders, Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]))); this.headersSent = true; return this },
      get statusCode() { return capturedStatus },
      set statusCode(v: number) { capturedStatus = v },
      setHeader(name: string, value: string | string[]) {
        capturedHeaders[name.toLowerCase()] = value
      },
      write(chunk: string | Buffer) {
        this.headersSent = true
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf-8'))
        return true
      },
      end(body?: string | Buffer) {
        if (this.writableEnded) return this
        this.headersSent = true
        this.writableEnded = true
        if (body !== undefined) {
          chunks.push(Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf-8'))
        }
        finish({
          html: Buffer.concat(chunks).toString('utf-8'),
          headers: { ...capturedHeaders },
          statusCode: capturedStatus,
          builtAt: Date.now(),
          revalidate,
        })
        events.emit('finish')
        return this
      },
    }) as unknown as ServerResponse

    const fakeReq = Object.assign(Readable.from([]), {
      url: urlPath, method: 'GET', headers: { ...request.headers },
      socket: request.socket, httpVersion: request.httpVersion,
    }) as IncomingMessage

    try {
      const result = handler(fakeReq, fakeRes)
      if (result && typeof (result as Promise<void>).catch === 'function') {
        ;(result as Promise<void>).catch(() => finish(null))
      }
    } catch {
      finish(null)
    }
  })
}

function _serveFromCache(entry: IsrCacheEntry, res: ServerResponse, status: 'HIT' | 'STALE' | 'BYPASS'): void {
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
function isCacheable(entry: IsrCacheEntry): boolean {
  return entry.statusCode === 200 && !entry.headers['set-cookie'] &&
    !/private|no-store/i.test(String(entry.headers['cache-control'] ?? '')) &&
    !String(entry.headers.vary ?? '').split(',').some((name) => name.trim() && name.trim().toLowerCase() !== 'accept-encoding')
}

export function createIsrHandler(
  routes: Array<{ path: string; meta?: Record<string, unknown> }>,
  handler: SsrHandlerFn,
): SsrHandlerFn {
  const cache = new Map<string, IsrCacheEntry>()
  const cold = new Map<string, Promise<IsrCacheEntry | null>>()
  const store = (path: string, entry: IsrCacheEntry) => {
    if (!isCacheable(entry)) return
    if (!cache.has(path) && cache.size >= 1000) cache.delete(cache.keys().next().value!)
    cache.set(path, entry)
  }
  // True lock: stores the in-flight revalidation Promise per URL path.
  // A path present in this map means a background render is already in progress.
  const _inFlight = new Map<string, Promise<void>>()

  return async (req: IncomingMessage, res: ServerResponse): Promise<unknown> => {
    const urlPath = (req.url ?? '/').split('?')[0]
    const revalidate = _findRevalidate(routes, urlPath)

    const mode = routes.find((route) => _matchPattern(route.path, urlPath))?.meta?.render
    const middlewarePrivate = res.getHeader?.('set-cookie') ||
      /private|no-store/i.test(String(res.getHeader?.('cache-control') ?? '')) ||
      String(res.getHeader?.('vary') ?? '').split(',').some((name) => name.trim() && name.trim().toLowerCase() !== 'accept-encoding')
    // Only anonymous, canonical GET documents can share cached HTML.
    if (revalidate === null || revalidate < 0 || mode === 'server' || middlewarePrivate ||
        (req.method ?? 'GET') !== 'GET' || (req.url ?? '').includes('?') || req.headers.cookie || req.headers.authorization) {
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
        const promise = _renderForCache(urlPath, handler, revalidate, req).then((entry) => {
          if (entry) store(urlPath, entry)
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
    // Before rendering we cannot know whether the response varies by a header.
    // Coalesce only identical requests so uncached responses remain isolated.
    const coldKey = JSON.stringify([urlPath, Object.entries(req.headers).sort(([a], [b]) => a.localeCompare(b))])
    if (!cold.has(coldKey)) cold.set(coldKey, _renderForCache(urlPath, handler, revalidate, req).finally(() => cold.delete(coldKey)))
    const entry = await cold.get(coldKey)!
    if (entry) {
      store(urlPath, entry)
      _serveFromCache(entry, res, isCacheable(entry) ? 'HIT' : 'BYPASS')
    } else {
      await handler(req, res)
    }
  }
}
