import { describe, it, expect, vi, afterEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createIsrHandler } from '../../runtime/isr-handler.js'

// ─── Test helpers ─────────────────────────────────────────────────────────────

function mockReq(url = '/page') {
  return { url, headers: {}, method: 'GET' } as unknown as IncomingMessage
}

type MockRes = ServerResponse & { header(k: string): string | undefined; body(): string }

function mockRes(): MockRes {
  const headers: Record<string, string> = {}
  let body = ''
  let status = 200
  return {
    get statusCode() { return status },
    set statusCode(v: number) { status = v },
    setHeader: vi.fn((k: string, v: string) => { headers[k.toLowerCase()] = v }),
    write: vi.fn(),
    end: vi.fn((b?: string) => { if (b) body = b }),
    header: (k: string) => headers[k.toLowerCase()],
    body: () => body,
  } as unknown as MockRes
}

afterEach(() => { vi.useRealTimers() })

// ─── Pass-through for non-ISR routes ─────────────────────────────────────────

describe('createIsrHandler — non-ISR routes', () => {
  it('calls handler directly when route has no revalidate', async () => {
    const routes = [{ path: '/about' }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => res.end('ok'))
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/about'), mockRes())
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not set X-Cache header for non-ISR routes', async () => {
    const routes = [{ path: '/about' }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => res.end('ok'))
    const wrapped = createIsrHandler(routes, handler)
    const res = mockRes()
    await wrapped(mockReq('/about'), res)
    expect(res.header('x-cache')).toBeUndefined()
  })

  it('passes through when no routes match the URL', async () => {
    const routes = [{ path: '/contact', meta: { ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => res.end('ok'))
    const wrapped = createIsrHandler(routes, handler)
    const res = mockRes()
    await wrapped(mockReq('/about'), res) // /about has no route
    expect(handler).toHaveBeenCalledTimes(1)
    expect(res.header('x-cache')).toBeUndefined()
  })
})

// ─── Cache miss (first request) ───────────────────────────────────────────────

describe('createIsrHandler — cache miss', () => {
  it('serves X-Cache: HIT on the first request to an ISR route', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => res.end('<html>v1</html>'))
    const wrapped = createIsrHandler(routes, handler)
    const res = mockRes()
    await wrapped(mockReq('/page'), res)
    expect(res.header('x-cache')).toBe('HIT')
  })

  it('renders via handler on cache miss', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => res.end('<html>content</html>'))
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page'), mockRes())
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes the correct URL to the handler during cache rendering', async () => {
    const routes = [{ path: '/blog/:slug', meta: { ssg: { revalidate: 60 } } }]
    let capturedUrl = ''
    const handler = vi.fn((req: IncomingMessage, res: ServerResponse) => {
      capturedUrl = req.url ?? ''
      res.end('<html/>')
    })
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/blog/hello'), mockRes())
    expect(capturedUrl).toBe('/blog/hello')
  })
})

// ─── Cache hit (within TTL) ───────────────────────────────────────────────────

describe('createIsrHandler — cache hit', () => {
  it('serves X-Cache: HIT from cache on second request within TTL', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => res.end('<html>v1</html>'))
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page'), mockRes()) // prime
    const res2 = mockRes()
    await wrapped(mockReq('/page'), res2)
    expect(res2.header('x-cache')).toBe('HIT')
  })

  it('does not call handler again on cache hit', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => res.end('<html>v1</html>'))
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page'), mockRes()) // prime
    await wrapped(mockReq('/page'), mockRes())
    expect(handler).toHaveBeenCalledTimes(1) // no re-render
  })

  it('serves the cached HTML body', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => res.end('<html>cached body</html>'))
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page'), mockRes()) // prime
    const res2 = mockRes()
    await wrapped(mockReq('/page'), res2)
    expect(res2.body()).toBe('<html>cached body</html>')
  })

  it('forwards cached response headers', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end('<html/>')
    })
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page'), mockRes()) // prime
    const res2 = mockRes()
    await wrapped(mockReq('/page'), res2)
    expect(res2.header('content-type')).toBe('text/html; charset=utf-8')
  })

  it('forwards cached HTTP status code', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => {
      res.statusCode = 200
      res.end('<html/>')
    })
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page'), mockRes()) // prime
    const res2 = mockRes()
    await wrapped(mockReq('/page'), res2)
    expect(res2.statusCode).toBe(200)
  })
})

// ─── Stale (TTL expired) ──────────────────────────────────────────────────────

describe('createIsrHandler — stale-while-revalidate', () => {
  it('serves X-Cache: STALE when TTL has expired (revalidate: 0)', async () => {
    // revalidate: 0 means TTL is always expired after first render
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 0 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => res.end('<html>v1</html>'))
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page'), mockRes()) // prime (HIT)
    const res2 = mockRes()
    await wrapped(mockReq('/page'), res2)
    expect(res2.header('x-cache')).toBe('STALE')
  })

  it('serves stale HTML body immediately while revalidating in background', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 0 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => res.end('<html>stale content</html>'))
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page'), mockRes()) // prime
    const res2 = mockRes()
    await wrapped(mockReq('/page'), res2)
    expect(res2.body()).toBe('<html>stale content</html>')
  })

  it('triggers a background re-render when stale', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 0 } } }]
    let callCount = 0
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => {
      callCount++
      res.end(`<html>v${callCount}</html>`)
    })
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page'), mockRes()) // prime (callCount=1)
    await wrapped(mockReq('/page'), mockRes()) // stale → triggers background render (callCount=2)
    await new Promise((r) => setTimeout(r, 0)) // let background render settle
    expect(callCount).toBe(2)
  })

  it('does not spawn a second background render while one is in flight', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 0 } } }]
    let callCount = 0
    let resolveHung: (() => void) | undefined
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => {
      callCount++
      if (callCount === 1) {
        res.end('<html>initial</html>')
      } else {
        // Simulate a slow background re-render that never ends in this test
        new Promise<void>((r) => { resolveHung = r }).then(() => res.end('<html>refreshed</html>'))
      }
    })
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page'), mockRes()) // prime
    await wrapped(mockReq('/page'), mockRes()) // stale → background render in flight
    // Third request while background render still in flight — should NOT spawn another
    await wrapped(mockReq('/page'), mockRes())
    expect(callCount).toBe(2) // still only 2 renders
    resolveHung?.() // clean up
  })

  it('resets revalidating flag when background render fails', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 0 } } }]
    let callCount = 0
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => {
      callCount++
      if (callCount === 1) {
        res.end('<html>initial</html>')
      } else {
        throw new Error('render failed')
      }
    })
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page'), mockRes()) // prime
    await wrapped(mockReq('/page'), mockRes()) // stale → background render throws
    await new Promise((r) => setTimeout(r, 0)) // let background render settle

    // After failed background render, revalidating flag should be reset.
    // The third request should trigger a new background render (callCount=3).
    const res3 = mockRes()
    await wrapped(mockReq('/page'), res3)
    expect(res3.header('x-cache')).toBe('STALE')
    expect(callCount).toBe(3) // a new render was triggered
  })

  it('resets revalidating flag after 30s timeout (hung render)', async () => {
    vi.useFakeTimers()
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 0 } } }]
    let callCount = 0
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => {
      callCount++
      if (callCount === 1) res.end('<html>initial</html>')
      // callCount >= 2: hung — never calls res.end()
    })
    const wrapped = createIsrHandler(routes, handler)

    // Prime the cache (synchronous handler, resolves immediately)
    await wrapped(mockReq('/page'), mockRes())
    // Trigger stale + hung background render
    await wrapped(mockReq('/page'), mockRes())

    // Advance clock past 30s — revalidating flag should be reset by timeout
    vi.advanceTimersByTime(31_000)

    // After timeout reset, a new request should be able to start a fresh revalidation
    const res3 = mockRes()
    await wrapped(mockReq('/page'), res3)
    expect(callCount).toBeGreaterThan(2) // a new render attempt was made
    expect(res3.header('x-cache')).toBe('STALE')
  })
})

// ─── Query string handling ─────────────────────────────────────────────────────

describe('createIsrHandler — query string handling', () => {
  it('strips query string when looking up the cache key', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => { res.end('<html>content</html>') })
    const wrapped = createIsrHandler(routes, handler)
    // Prime with a query-string URL
    await wrapped(mockReq('/page?foo=bar'), mockRes())
    // Second request with a different query string — should still be a cache HIT
    const res2 = mockRes()
    await wrapped(mockReq('/page?baz=qux'), res2)
    expect(res2.header('x-cache')).toBe('HIT')
    expect(handler).toHaveBeenCalledTimes(1) // only one render; second served from cache
  })

  it('serves the cached HTML regardless of query string variation', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => { res.end('<html>cached</html>') })
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page?v=1'), mockRes())
    const res2 = mockRes()
    await wrapped(mockReq('/page?v=2'), res2)
    expect(res2.body()).toBe('<html>cached</html>')
  })

  it('passes the stripped URL (no query string) to the handler during cache render', async () => {
    // _renderForCache always uses the path-only URL for the fake request so the
    // handler renders the canonical path, not a query-string-specific variant.
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 60 } } }]
    let capturedUrl = ''
    const handler = vi.fn((req: IncomingMessage, res: ServerResponse) => {
      capturedUrl = req.url ?? ''
      res.end('<html/>')
    })
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page?source=test'), mockRes())
    expect(capturedUrl).toBe('/page')
  })
})

// ─── render mode compatibility ────────────────────────────────────────────────

describe('createIsrHandler — render mode compatibility', () => {
  it('caches a route with meta.render: server when revalidate is set', async () => {
    // ISR applies to any route with meta.ssg.revalidate regardless of meta.render.
    // render: 'server' controls SSG build-time behavior; ISR is a runtime cache layer.
    const routes = [{ path: '/dashboard', meta: { render: 'server', ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => { res.end('<html>dash</html>') })
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/dashboard'), mockRes()) // prime
    const res2 = mockRes()
    await wrapped(mockReq('/dashboard'), res2)
    expect(res2.header('x-cache')).toBe('HIT')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not cache a route with meta.render: server when revalidate is absent', async () => {
    const routes = [{ path: '/dashboard', meta: { render: 'server' } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => { res.end('<html>dash</html>') })
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/dashboard'), mockRes())
    const res2 = mockRes()
    await wrapped(mockReq('/dashboard'), res2)
    expect(res2.header('x-cache')).toBeUndefined()
    expect(handler).toHaveBeenCalledTimes(2) // no cache — handler called each time
  })
})
