import { describe, it, expect, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  matchRoutePattern,
  findRevalidate,
  findRenderMode,
  renderForIsr,
  serveFromIsrCache,
  type IsrCacheEntry,
} from '../../cli/commands/preview-isr.js'

// ─── matchRoutePattern ────────────────────────────────────────────────────────

describe('matchRoutePattern', () => {
  it('matches identical paths', () => {
    expect(matchRoutePattern('/about', '/about')).toBe(true)
  })

  it('matches root path', () => {
    expect(matchRoutePattern('/', '/')).toBe(true)
  })

  it('does not match different static paths', () => {
    expect(matchRoutePattern('/about', '/contact')).toBe(false)
  })

  it('matches :param segments', () => {
    expect(matchRoutePattern('/blog/:slug', '/blog/hello-world')).toBe(true)
  })

  it('does not match when param segment is missing', () => {
    expect(matchRoutePattern('/blog/:slug', '/blog')).toBe(false)
  })

  it('matches :param* catch-all against single segment', () => {
    expect(matchRoutePattern('/:all*', '/about')).toBe(true)
  })

  it('matches :param* catch-all against multi-segment path', () => {
    expect(matchRoutePattern('/:all*', '/deeply/nested/path')).toBe(true)
  })

  it('matches :param* catch-all against root', () => {
    expect(matchRoutePattern('/:all*', '/')).toBe(true)
  })

  it('does not match longer path against shorter static pattern', () => {
    expect(matchRoutePattern('/blog', '/blog/extra')).toBe(false)
  })

  it('handles trailing slashes gracefully', () => {
    expect(matchRoutePattern('/about/', '/about')).toBe(true)
    expect(matchRoutePattern('/about', '/about/')).toBe(true)
  })

  it('matches multiple :param segments', () => {
    expect(matchRoutePattern('/users/:id/posts/:postId', '/users/42/posts/99')).toBe(true)
  })

  it('does not match paths that differ only by a regex wildcard character (dot-safety)', () => {
    // Without escaping, '/api.v1' regex would be '^/apixv1$' which matches '/apixv1'.
    // With escaping, the dot is literal and '/apixv1' must not match '/api.v1'.
    expect(matchRoutePattern('/api.v1/users', '/apixv1/users')).toBe(false)
  })

  it('matches route with literal dot in static segment', () => {
    expect(matchRoutePattern('/api.v1/users', '/api.v1/users')).toBe(true)
  })
})

// ─── findRevalidate ───────────────────────────────────────────────────────────

describe('findRevalidate', () => {
  it('returns null for an empty routes array', () => {
    expect(findRevalidate([], '/about')).toBeNull()
  })

  it('returns null when no route matches', () => {
    const routes = [{ path: '/contact', meta: { ssg: { revalidate: 60 } } }]
    expect(findRevalidate(routes, '/about')).toBeNull()
  })

  it('returns null when matched route has no meta', () => {
    const routes = [{ path: '/about' }]
    expect(findRevalidate(routes, '/about')).toBeNull()
  })

  it('returns null when matched route has no ssg.revalidate', () => {
    const routes = [{ path: '/about', meta: { layout: 'default' } }]
    expect(findRevalidate(routes, '/about')).toBeNull()
  })

  it('returns revalidate value for a matching static route', () => {
    const routes = [{ path: '/about', meta: { ssg: { revalidate: 60 } } }]
    expect(findRevalidate(routes, '/about')).toBe(60)
  })

  it('returns revalidate value for a matching dynamic route', () => {
    const routes = [{ path: '/blog/:slug', meta: { ssg: { revalidate: 300 } } }]
    expect(findRevalidate(routes, '/blog/hello')).toBe(300)
  })

  it('returns revalidate value for a catch-all route', () => {
    const routes = [{ path: '/:all*', meta: { ssg: { revalidate: 120 } } }]
    expect(findRevalidate(routes, '/some/unmatched/path')).toBe(120)
  })

  it('picks the first matching route when multiple match', () => {
    const routes = [
      { path: '/blog/:slug', meta: { ssg: { revalidate: 300 } } },
      { path: '/:all*', meta: { ssg: { revalidate: 60 } } },
    ]
    // /blog/:slug matches first
    expect(findRevalidate(routes, '/blog/post')).toBe(300)
  })

  it('ignores non-numeric revalidate values', () => {
    const routes = [{ path: '/about', meta: { ssg: { revalidate: 'invalid' } } }]
    expect(findRevalidate(routes, '/about')).toBeNull()
  })
})

// ─── findRenderMode ───────────────────────────────────────────────────────────

describe('findRenderMode', () => {
  it('returns null for an empty routes array', () => {
    expect(findRenderMode([], '/about')).toBeNull()
  })

  it('returns null when no route matches', () => {
    const routes = [{ path: '/contact', meta: { render: 'server' } }]
    expect(findRenderMode(routes, '/about')).toBeNull()
  })

  it('returns null when matched route has no render meta', () => {
    const routes = [{ path: '/about' }]
    expect(findRenderMode(routes, '/about')).toBeNull()
  })

  it('returns "server" for a matching route with render: server', () => {
    const routes = [{ path: '/dashboard', meta: { render: 'server' } }]
    expect(findRenderMode(routes, '/dashboard')).toBe('server')
  })

  it('returns "spa" for a matching route with render: spa', () => {
    const routes = [{ path: '/profile', meta: { render: 'spa' } }]
    expect(findRenderMode(routes, '/profile')).toBe('spa')
  })

  it('returns "static" for a matching route with render: static', () => {
    const routes = [{ path: '/about', meta: { render: 'static' } }]
    expect(findRenderMode(routes, '/about')).toBe('static')
  })

  it('returns null for unrecognised render values', () => {
    const routes = [{ path: '/about', meta: { render: 'unknown' } }]
    expect(findRenderMode(routes, '/about')).toBeNull()
  })

  it('matches dynamic routes', () => {
    const routes = [{ path: '/blog/:slug', meta: { render: 'server' } }]
    expect(findRenderMode(routes, '/blog/my-post')).toBe('server')
  })
})

// ─── renderForIsr ─────────────────────────────────────────────────────────────

describe('renderForIsr', () => {
  it('captures HTML from the handler', async () => {
    const handler = (_req: IncomingMessage, res: ServerResponse) => {
      res.setHeader('Content-Type', 'text/html')
      res.end('<html>hello</html>')
    }
    const entry = await renderForIsr('/about', handler, 60)
    expect(entry).not.toBeNull()
    expect(entry!.html).toBe('<html>hello</html>')
  })

  it('captures status code from the handler', async () => {
    const handler = (_req: IncomingMessage, res: ServerResponse) => {
      res.statusCode = 404
      res.end('Not Found')
    }
    const entry = await renderForIsr('/missing', handler, 30)
    expect(entry!.statusCode).toBe(404)
  })

  it('captures response headers from the handler', async () => {
    const handler = (_req: IncomingMessage, res: ServerResponse) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end('<html/>')
    }
    const entry = await renderForIsr('/about', handler, 60)
    expect(entry!.headers['content-type']).toBe('text/html; charset=utf-8')
  })

  it('sets revalidate to the provided TTL', async () => {
    const handler = (_req: IncomingMessage, res: ServerResponse) => { res.end('ok') }
    const entry = await renderForIsr('/about', handler, 300)
    expect(entry!.revalidate).toBe(300)
  })

  it('sets revalidating to false on the returned entry', async () => {
    const handler = (_req: IncomingMessage, res: ServerResponse) => { res.end('ok') }
    const entry = await renderForIsr('/about', handler, 60)
    expect(entry!.revalidating).toBe(false)
  })

  it('returns null when the handler throws', async () => {
    const handler = () => { throw new Error('boom') }
    const entry = await renderForIsr('/about', handler as SsrHandlerFn, 60)
    expect(entry).toBeNull()
  })

  it('passes the correct URL to the synthetic request', async () => {
    let capturedUrl = ''
    const handler = (req: IncomingMessage, res: ServerResponse) => {
      capturedUrl = req.url ?? ''
      res.end('ok')
    }
    await renderForIsr('/blog/hello', handler, 60)
    expect(capturedUrl).toBe('/blog/hello')
  })
})

type SsrHandlerFn = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

// ─── serveFromIsrCache ────────────────────────────────────────────────────────

describe('serveFromIsrCache', () => {
  function makeFakeRes() {
    const headers: Record<string, string> = {}
    let statusCode = 200
    let body = ''
    const res = {
      get statusCode() { return statusCode },
      set statusCode(v: number) { statusCode = v },
      setHeader: vi.fn((name: string, value: string) => { headers[name] = value }),
      end: vi.fn((chunk: string) => { body = chunk }),
      _headers: headers,
      _body: () => body,
      _status: () => statusCode,
    }
    return res
  }

  function makeEntry(overrides: Partial<IsrCacheEntry> = {}): IsrCacheEntry {
    return {
      html: '<html>cached</html>',
      headers: { 'content-type': 'text/html' },
      statusCode: 200,
      builtAt: Date.now(),
      revalidate: 60,
      revalidating: false,
      ...overrides,
    }
  }

  it('writes the cached HTML to the response', () => {
    const res = makeFakeRes()
    serveFromIsrCache(makeEntry(), res as unknown as ServerResponse, 'HIT')
    expect(res.end).toHaveBeenCalledWith('<html>cached</html>')
  })

  it('sets X-Cache: HIT header', () => {
    const res = makeFakeRes()
    serveFromIsrCache(makeEntry(), res as unknown as ServerResponse, 'HIT')
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT')
  })

  it('sets X-Cache: STALE header', () => {
    const res = makeFakeRes()
    serveFromIsrCache(makeEntry(), res as unknown as ServerResponse, 'STALE')
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'STALE')
  })

  it('forwards cached headers to the response', () => {
    const entry = makeEntry({ headers: { 'content-type': 'text/html; charset=utf-8' } })
    const res = makeFakeRes()
    serveFromIsrCache(entry, res as unknown as ServerResponse, 'HIT')
    expect(res.setHeader).toHaveBeenCalledWith('content-type', 'text/html; charset=utf-8')
  })

  it('sets the status code from the cache entry', () => {
    const entry = makeEntry({ statusCode: 404 })
    const res = makeFakeRes()
    serveFromIsrCache(entry, res as unknown as ServerResponse, 'HIT')
    expect(res._status()).toBe(404)
  })
})
