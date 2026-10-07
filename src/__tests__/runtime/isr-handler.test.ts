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
    getHeader: (k: string) => headers[k.toLowerCase()],
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

  it('releases the in-flight lock when background render fails', async () => {
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

  it('lock is released once the background render resolves, allowing a new revalidation', async () => {
    // Promise-based lock: once the in-flight Promise settles the path is removed
    // from the lock map, so the next stale request can start a new background render.
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 0 } } }]
    let callCount = 0
    let resolveSecond: (() => void) | undefined
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => {
      callCount++
      if (callCount === 1) {
        res.end('<html>initial</html>')
      } else if (callCount === 2) {
        // Second render completes after we release it.
        new Promise<void>((r) => { resolveSecond = r }).then(() => res.end('<html>v2</html>'))
      } else {
        res.end('<html>v3</html>')
      }
    })
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/page'), mockRes()) // prime
    await wrapped(mockReq('/page'), mockRes()) // stale → in-flight render #2
    // While render #2 is in flight, a third request must NOT spawn render #3.
    await wrapped(mockReq('/page'), mockRes())
    expect(callCount).toBe(2) // still only 2

    // Release render #2 — lock is freed after the Promise settles.
    resolveSecond?.()
    await new Promise((r) => setTimeout(r, 0)) // let the microtask queue drain

    // Now the lock is gone — a new request should be able to start render #3.
    await wrapped(mockReq('/page'), mockRes())
    expect(callCount).toBe(3)
  })
})

// ─── Query string handling ─────────────────────────────────────────────────────

describe('createIsrHandler — query string handling', () => {
  it('bypasses caching for requests with query strings', async () => {
    const routes = [{ path: '/page', meta: { ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => { res.end('<html>content</html>') })
    const wrapped = createIsrHandler(routes, handler)
    // Prime with a query-string URL
    await wrapped(mockReq('/page?foo=bar'), mockRes())
    // Second request with a different query string — should still be a cache HIT
    const res2 = mockRes()
    await wrapped(mockReq('/page?baz=qux'), res2)
    expect(res2.header('x-cache')).toBeUndefined()
    expect(handler).toHaveBeenCalledTimes(2) // only one render; second served from cache
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

  it('preserves query strings when invoking the uncached handler', async () => {
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
    expect(capturedUrl).toBe('/page?source=test')
  })
})

// ─── render mode compatibility ────────────────────────────────────────────────

describe('createIsrHandler — render mode compatibility', () => {
  it('bypasses caching for a route with meta.render: server when revalidate is set', async () => {
    // ISR applies to any route with meta.ssg.revalidate regardless of meta.render.
    // render: 'server' controls SSG build-time behavior; ISR is a runtime cache layer.
    const routes = [{ path: '/dashboard', meta: { render: 'server', ssg: { revalidate: 60 } } }]
    const handler = vi.fn((_: IncomingMessage, res: ServerResponse) => { res.end('<html>dash</html>') })
    const wrapped = createIsrHandler(routes, handler)
    await wrapped(mockReq('/dashboard'), mockRes()) // prime
    const res2 = mockRes()
    await wrapped(mockReq('/dashboard'), res2)
    expect(res2.header('x-cache')).toBeUndefined()
    expect(handler).toHaveBeenCalledTimes(2)
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

describe('ISR privacy and cold request coalescing', () => {
  const routes = [{ path: '/page', meta: { ssg: { revalidate: 60 } } }]
  it('bypasses an existing public cache when middleware marks the response private', async () => {
    const render = vi.fn((_req: IncomingMessage, res: ServerResponse) => res.end('Document'))
    const handler = createIsrHandler(routes, render)
    await handler(mockReq(), mockRes())
    const privateRes = mockRes(); privateRes.setHeader('Set-Cookie', 'session=private')
    await handler(mockReq(), privateRes)
    expect(render).toHaveBeenCalledTimes(2); expect(privateRes.header('x-cache')).toBeUndefined()
  })
  it('preserves request headers and isolates concurrent language-dependent responses', async () => {
    const handler = createIsrHandler(routes, async (req, res) => {
      await new Promise((done) => setTimeout(done, 10))
      res.setHeader('Vary', 'Accept-Language')
      res.end(req.headers['accept-language'])
    })
    const english = mockReq(), french = mockReq()
    english.headers['accept-language'] = 'en'; french.headers['accept-language'] = 'fr'
    const first = mockRes(), second = mockRes()
    await Promise.all([handler(english, first), handler(french, second)])
    expect(first.body()).toBe('en'); expect(second.body()).toBe('fr')
    expect(first.header('x-cache')).toBe('BYPASS')
  })
  it('preserves separate cookie headers on uncached responses', async () => {
    const cookies = ['first=1; Path=/', 'second=2; Path=/']
    const handler = createIsrHandler(routes, (_req, res) => { res.setHeader('Set-Cookie', cookies); res.end('ok') })
    const res = mockRes()
    await handler(mockReq(), res)
    expect(res.setHeader).toHaveBeenCalledWith('set-cookie', cookies)
  })
  for (const headers of [{ 'set-cookie': 'session=secret' }, { 'cache-control': 'PRIVATE' }, { vary: 'Accept-Language' }]) {
    it(`does not cache ${Object.keys(headers)[0]} responses`, async () => {
      let renders = 0
      const handler = createIsrHandler(routes, (_req, res) => {
        renders++
        for (const [key, value] of Object.entries(headers)) res.setHeader(key, value!)
        res.end(String(renders))
      })
      const first = mockRes(), second = mockRes()
      await handler(mockReq(), first); await handler(mockReq(), second)
      expect(renders).toBe(2); expect(second.header('x-cache')).toBe('BYPASS')
    })
  }
  it('coalesces concurrent anonymous cold renders', async () => {
    const render = vi.fn(async (_req: IncomingMessage, res: ServerResponse) => { await new Promise((done) => setTimeout(done, 10)); res.end('Shared') })
    const handler = createIsrHandler(routes, render)
    const first = mockRes(), second = mockRes()
    await Promise.all([handler(mockReq(), first), handler(mockReq(), second)])
    expect(render).toHaveBeenCalledOnce(); expect(first.body()).toBe('Shared'); expect(second.body()).toBe('Shared')
  })
  it('preserves personalized requests without populating the anonymous cache', async () => {
    const render = vi.fn((_req: IncomingMessage, res: ServerResponse) => res.end('Personal'))
    const handler = createIsrHandler(routes, render), req = mockReq()
    req.headers.cookie = 'session=secret'
    await handler(req, mockRes()); await handler(req, mockRes())
    expect(render).toHaveBeenCalledTimes(2)
  })
})
