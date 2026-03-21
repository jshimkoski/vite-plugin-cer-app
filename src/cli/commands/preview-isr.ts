/**
 * ISR (Incremental Static Regeneration) helpers for the preview server.
 *
 * Extracted into their own module so they can be unit-tested independently
 * from the HTTP server wiring in preview.ts.
 */

import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IsrCacheEntry {
  html: string
  headers: Record<string, string>
  statusCode: number
  builtAt: number
  revalidate: number
  /** True while a background re-render is in flight (stale-while-revalidate). */
  revalidating: boolean
}

export type IsrCacheStatus = 'HIT' | 'STALE' | 'MISS'

export type SsrHandlerFn = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

// ─── Route pattern matching ───────────────────────────────────────────────────

/**
 * Tests whether a route path pattern matches a URL path string.
 * Normalises trailing slashes and supports `:param` and `:param*` (catch-all)
 * segments using a simple regex conversion — no external dependencies needed.
 *
 * @example
 * matchRoutePattern('/blog/:slug', '/blog/hello') // true
 * matchRoutePattern('/:all*', '/any/deep/path')   // true
 * matchRoutePattern('/about', '/contact')          // false
 */
export function matchRoutePattern(pattern: string, urlPath: string): boolean {
  const norm = (s: string): string => s.replace(/\/+$/, '') || '/'
  if (norm(pattern) === norm(urlPath)) return true
  const regexStr =
    '^' +
    norm(pattern)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape regex special chars in static segments
      .replace(/:[^/]+\*/g, '.*')
      .replace(/:[^/]+/g, '[^/]+') +
    '$'
  return new RegExp(regexStr).test(norm(urlPath))
}

/**
 * Looks up the `meta.ssg.revalidate` TTL (in seconds) for the route that best
 * matches `urlPath`. Returns `null` when no route matches or none defines
 * `revalidate`.
 */
export function findRevalidate(
  routes: Array<{ path: string; meta?: Record<string, unknown> }>,
  urlPath: string,
): number | null {
  for (const route of routes) {
    if (matchRoutePattern(route.path, urlPath)) {
      const ssg = route.meta?.ssg as Record<string, unknown> | undefined
      if (typeof ssg?.revalidate === 'number') return ssg.revalidate
    }
  }
  return null
}

// ─── Response capture ─────────────────────────────────────────────────────────

/**
 * Renders a URL path through `handler` using a synthetic IncomingMessage and a
 * fake ServerResponse that captures the output in memory.
 *
 * Returns an `IsrCacheEntry` on success, or `null` if the handler throws.
 */
export async function renderForIsr(
  urlPath: string,
  handler: SsrHandlerFn,
  revalidate: number,
): Promise<IsrCacheEntry | null> {
  const req = Object.assign(new Readable({ read() {} }), {
    url: urlPath,
    method: 'GET',
    headers: {},
    socket: null,
  }) as unknown as IncomingMessage

  return new Promise<IsrCacheEntry | null>((resolve) => {
    const chunks: Buffer[] = []
    const headers: Record<string, string> = {}
    let capturedStatus = 200

    const fakeRes = {
      get statusCode() { return capturedStatus },
      set statusCode(v: number) { capturedStatus = v },
      headersSent: false,
      setHeader(name: string, value: string | string[]) {
        headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value)
        return this
      },
      getHeader(name: string) { return headers[name.toLowerCase()] },
      write(chunk: string | Buffer) {
        if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
        return true
      },
      end(chunk?: string | Buffer) {
        if (chunk != null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
        const html = Buffer.concat(chunks).toString('utf-8')
        resolve({ html, headers, statusCode: capturedStatus, builtAt: Date.now(), revalidate, revalidating: false })
        return this
      },
    } as unknown as ServerResponse

    // Use Promise.resolve().then() so synchronous throws in the handler are
    // also caught by the .catch() handler.
    Promise.resolve().then(() => handler(req, fakeRes)).catch(() => resolve(null))
  })
}

// ─── Cache serving ────────────────────────────────────────────────────────────

/**
 * Writes a cached ISR entry to the real HTTP response, forwarding all captured
 * headers and setting the `X-Cache` diagnostic header.
 */
export function serveFromIsrCache(
  entry: IsrCacheEntry,
  res: ServerResponse,
  cacheStatus: IsrCacheStatus,
): void {
  for (const [name, value] of Object.entries(entry.headers)) {
    res.setHeader(name, value)
  }
  res.setHeader('X-Cache', cacheStatus)
  res.statusCode = entry.statusCode
  res.end(entry.html)
}
