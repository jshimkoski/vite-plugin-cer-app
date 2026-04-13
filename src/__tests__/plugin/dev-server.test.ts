import { vi, describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { configureCerDevServer } from '../../plugin/dev-server.js'
import type { ResolvedCerConfig } from '../../plugin/dev-server.js'

const HTML_SHELL_ROOT = '/Users/jshimkoski/dev/cer/custom-elements'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a minimal mock IncomingMessage.
 * Body events are emitted via setImmediate so they fire after readBody
 * registers its 'data'/'end' listeners (which happens inside the async
 * middleware after several awaited ssrLoadModule calls).
 */
function createReq(opts: {
  url?: string
  method?: string
  headers?: Record<string, string>
  body?: string
} = {}) {
  const emitter = new EventEmitter()
  setImmediate(() => {
    if (opts.body !== undefined) emitter.emit('data', Buffer.from(opts.body))
    emitter.emit('end')
  })
  return Object.assign(emitter, {
    url: opts.url ?? '/',
    method: opts.method ?? 'GET',
    headers: opts.headers ?? {},
  })
}

function createRes() {
  const res: any = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() }
  return res
}

function makeConfig(overrides: Partial<ResolvedCerConfig> = {}): ResolvedCerConfig {
  return {
    mode: 'spa',
    root: '/project',
    srcDir: '/project/app',
    pagesDir: '/project/app/pages',
    layoutsDir: '/project/app/layouts',
    componentsDir: '/project/app/components',
    composablesDir: '/project/app/composables',
    pluginsDir: '/project/app/plugins',
    middlewareDir: '/project/app/middleware',
    serverApiDir: '/project/server/api',
    serverMiddlewareDir: '/project/server/middleware',
    port: 3000,
    ssg: { routes: 'auto', concurrency: 2, fallback: false },
    router: {},
    jitCss: { content: [], extendedColors: false },
    autoImports: { components: true, composables: true, directives: true, runtime: true },
    ...overrides,
  } as ResolvedCerConfig
}

type MockServer = {
  middlewares: { use: ReturnType<typeof vi.fn> }
  ssrLoadModule: ReturnType<typeof vi.fn>
  ssrFixStacktrace: ReturnType<typeof vi.fn>
  transformIndexHtml: ReturnType<typeof vi.fn>
}

function makeServer(): { server: MockServer; getMiddleware: () => Function } {
  const registered: Function[] = []
  const server: MockServer = {
    middlewares: { use: vi.fn((fn: Function) => registered.push(fn)) },
    ssrLoadModule: vi.fn(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      return { apiRoutes: [] }
    }),
    ssrFixStacktrace: vi.fn(),
    transformIndexHtml: vi.fn(async (_url: string, html: string) => html),
  }
  return { server, getMiddleware: () => registered[0] }
}

// ─── Registration ─────────────────────────────────────────────────────────────

describe('configureCerDevServer — registration', () => {
  it('registers exactly one middleware via server.middlewares.use', () => {
    const { server } = makeServer()
    configureCerDevServer(server as any, makeConfig())
    expect(server.middlewares.use).toHaveBeenCalledTimes(1)
    expect(typeof (server.middlewares.use as any).mock.calls[0][0]).toBe('function')
  })
})

// ─── Non-API pass-through ─────────────────────────────────────────────────────

describe('configureCerDevServer — non-API pass-through', () => {
  it('calls next() for a non-HTML request with no matching routes', async () => {
    const { server, getMiddleware } = makeServer()
    configureCerDevServer(server as any, makeConfig())
    const next = vi.fn()
    await getMiddleware()(createReq({ url: '/assets/main.js', headers: { accept: 'application/javascript' } }), createRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('calls next() when ssrLoadModule throws (module not ready)', async () => {
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockRejectedValue(new Error('not ready'))
    configureCerDevServer(server as any, makeConfig())
    const next = vi.fn()
    await getMiddleware()(createReq({ url: '/test' }), createRes(), next)
    expect(next).toHaveBeenCalled()
  })
})

// ─── SPA shell handling ──────────────────────────────────────────────────────

describe('configureCerDevServer — SPA shell handling', () => {
  it('serves the transformed SPA shell for direct HTML navigations in spa mode', async () => {
    const { server, getMiddleware } = makeServer()
    server.transformIndexHtml.mockResolvedValue('<html>spa shell</html>')
    const res = createRes()

    configureCerDevServer(
      server as any,
      makeConfig({ root: HTML_SHELL_ROOT, mode: 'spa' }),
    )

    const next = vi.fn()
    await getMiddleware()(
      createReq({ url: '/music/effects/pro-co/rat', headers: { accept: 'text/html' } }),
      res,
      next,
    )

    expect(server.transformIndexHtml).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8')
    expect(res.end).toHaveBeenCalledWith('<html>spa shell</html>')
    expect(next).not.toHaveBeenCalled()
  })

  it('does not serve the SPA shell for API requests in spa mode', async () => {
    const { server, getMiddleware } = makeServer()
    configureCerDevServer(
      server as any,
      makeConfig({ root: HTML_SHELL_ROOT, mode: 'spa' }),
    )

    const next = vi.fn()
    await getMiddleware()(
      createReq({ url: '/api/missing', headers: { accept: 'text/html' } }),
      createRes(),
      next,
    )

    expect(server.transformIndexHtml).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })
})

// ─── API route matching ───────────────────────────────────────────────────────

describe('configureCerDevServer — API route matching', () => {
  function makeServerWithRoute(route: { path: string; handlers: Record<string, unknown> }) {
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      return { apiRoutes: [route] }
    })
    configureCerDevServer(server as any, makeConfig())
    return getMiddleware()
  }

  it('calls GET handler for matching path', async () => {
    const handler = vi.fn((req: any, res: any) => res.end('ok'))
    const middleware = makeServerWithRoute({ path: '/api/health', handlers: { get: handler } })
    const next = vi.fn()
    await middleware(createReq({ url: '/api/health' }), createRes(), next)
    expect(handler).toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('calls uppercase GET handler when lowercase is absent', async () => {
    const handler = vi.fn((req: any, res: any) => res.end('ok'))
    const middleware = makeServerWithRoute({ path: '/api/health', handlers: { GET: handler } })
    await middleware(createReq({ url: '/api/health' }), createRes(), vi.fn())
    expect(handler).toHaveBeenCalled()
  })

  it('calls default handler as fallback', async () => {
    const handler = vi.fn((req: any, res: any) => res.end('ok'))
    const middleware = makeServerWithRoute({ path: '/api/health', handlers: { default: handler } })
    await middleware(createReq({ url: '/api/health' }), createRes(), vi.fn())
    expect(handler).toHaveBeenCalled()
  })

  it('calls next() when no handler matches the HTTP method', async () => {
    const middleware = makeServerWithRoute({ path: '/api/health', handlers: {} })
    const next = vi.fn()
    await middleware(createReq({ url: '/api/health' }), createRes(), next)
    expect(next).toHaveBeenCalled()
  })

  it('does not match when segment counts differ', async () => {
    const handler = vi.fn()
    const middleware = makeServerWithRoute({ path: '/api/users/:id', handlers: { get: handler } })
    const next = vi.fn()
    await middleware(createReq({ url: '/api/users' }), createRes(), next)
    expect(handler).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it('does not match when a static segment differs', async () => {
    const handler = vi.fn()
    const middleware = makeServerWithRoute({ path: '/api/posts', handlers: { get: handler } })
    const next = vi.fn()
    await middleware(createReq({ url: '/api/users' }), createRes(), next)
    expect(handler).not.toHaveBeenCalled()
  })

  it('extracts dynamic route params and attaches to req', async () => {
    let capturedReq: any
    const handler = vi.fn((req: any, res: any) => { capturedReq = req; res.end('ok') })
    const middleware = makeServerWithRoute({ path: '/api/users/:id', handlers: { get: handler } })
    await middleware(createReq({ url: '/api/users/42' }), createRes(), vi.fn())
    expect(capturedReq.params).toEqual({ id: '42' })
  })

  it('attaches parsed query string to req', async () => {
    let capturedReq: any
    const handler = vi.fn((req: any, res: any) => { capturedReq = req; res.end('ok') })
    const middleware = makeServerWithRoute({ path: '/api/search', handlers: { get: handler } })
    await middleware(createReq({ url: '/api/search?q=hello&page=2' }), createRes(), vi.fn())
    expect(capturedReq.query).toEqual({ q: 'hello', page: '2' })
  })

  it('attaches empty query object when no query string', async () => {
    let capturedReq: any
    const handler = vi.fn((req: any, res: any) => { capturedReq = req; res.end('ok') })
    const middleware = makeServerWithRoute({ path: '/api/health', handlers: { get: handler } })
    await middleware(createReq({ url: '/api/health' }), createRes(), vi.fn())
    expect(capturedReq.query).toEqual({})
  })

  it('handles query param with no value (flag style ?active)', async () => {
    let capturedReq: any
    const handler = vi.fn((req: any, res: any) => { capturedReq = req; res.end('ok') })
    const middleware = makeServerWithRoute({ path: '/api/items', handlers: { get: handler } })
    await middleware(createReq({ url: '/api/items?active' }), createRes(), vi.fn())
    expect(capturedReq.query).toEqual({ active: '' })
  })

  it('skips empty segments from double-ampersand query strings', async () => {
    let capturedReq: any
    const handler = vi.fn((req: any, res: any) => { capturedReq = req; res.end('ok') })
    const middleware = makeServerWithRoute({ path: '/api/items', handlers: { get: handler } })
    await middleware(createReq({ url: '/api/items?a=1&&b=2' }), createRes(), vi.fn())
    expect(capturedReq.query).toEqual({ a: '1', b: '2' })
  })

  it('decodes URL-encoded route params', async () => {
    let capturedReq: any
    const handler = vi.fn((req: any, res: any) => { capturedReq = req; res.end('ok') })
    const middleware = makeServerWithRoute({ path: '/api/posts/:slug', handlers: { get: handler } })
    await middleware(createReq({ url: '/api/posts/hello%20world' }), createRes(), vi.fn())
    expect(capturedReq.params.slug).toBe('hello world')
  })

  it('returns 500 when API handler throws', async () => {
    const handler = vi.fn(() => { throw new Error('oops') })
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      return { apiRoutes: [{ path: '/api/boom', handlers: { get: handler } }] }
    })
    configureCerDevServer(server as any, makeConfig())
    const res = createRes()
    await getMiddleware()(createReq({ url: '/api/boom' }), res, vi.fn())
    expect(res.statusCode).toBe(500)
    expect(res.end).toHaveBeenCalled()
  })
})

// ─── Augmented response helpers ───────────────────────────────────────────────

describe('configureCerDevServer — augmented response helpers', () => {
  function makeServerWithRoute(handler: Function) {
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      return { apiRoutes: [{ path: '/api/test', handlers: { get: handler } }] }
    })
    configureCerDevServer(server as any, makeConfig())
    return getMiddleware()
  }

  it('res.json() serializes data and sets Content-Type', async () => {
    const res = createRes()
    const middleware = makeServerWithRoute((req: any, r: any) => r.json({ ok: true }))
    await middleware(createReq({ url: '/api/test' }), res, vi.fn())
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json')
    expect(res.end).toHaveBeenCalledWith('{"ok":true}')
  })

  it('res.status() sets statusCode and is chainable', async () => {
    const res = createRes()
    const middleware = makeServerWithRoute((req: any, r: any) => r.status(404).end('Not Found'))
    await middleware(createReq({ url: '/api/test' }), res, vi.fn())
    expect(res.statusCode).toBe(404)
    expect(res.end).toHaveBeenCalledWith('Not Found')
  })
})

// ─── POST body parsing ────────────────────────────────────────────────────────

describe('configureCerDevServer — POST body parsing', () => {
  it('parses JSON body for POST request', async () => {
    let capturedBody: unknown
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      return {
        apiRoutes: [{
          path: '/api/items',
          handlers: { post: (req: any, res: any) => { capturedBody = req.body; res.end('ok') } },
        }],
      }
    })
    configureCerDevServer(server as any, makeConfig())
    const req = createReq({
      url: '/api/items',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    })
    await getMiddleware()(req, createRes(), vi.fn())
    expect(capturedBody).toEqual({ name: 'test' })
  })

  it('returns raw Buffer body for POST with non-JSON content-type', async () => {
    let capturedBody: unknown
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      return {
        apiRoutes: [{
          path: '/api/upload',
          handlers: { post: (req: any, res: any) => { capturedBody = req.body; res.end('ok') } },
        }],
      }
    })
    configureCerDevServer(server as any, makeConfig())
    const req = createReq({
      url: '/api/upload',
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'raw text',
    })
    await getMiddleware()(req, createRes(), vi.fn())
    expect(Buffer.isBuffer(capturedBody)).toBe(true)
  })

  it('attaches undefined body for GET requests', async () => {
    let capturedBody: unknown = 'sentinel'
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      return {
        apiRoutes: [{
          path: '/api/items',
          handlers: { get: (req: any, res: any) => { capturedBody = req.body; res.end('ok') } },
        }],
      }
    })
    configureCerDevServer(server as any, makeConfig())
    await getMiddleware()(createReq({ url: '/api/items' }), createRes(), vi.fn())
    expect(capturedBody).toBeUndefined()
  })
})

// ─── Server middleware execution ──────────────────────────────────────────────

describe('configureCerDevServer — server middleware', () => {
  it('runs server middleware before API routes', async () => {
    const callOrder: string[] = []
    const smHandler = vi.fn((_req: any, _res: any, next: () => void) => {
      callOrder.push('sm')
      next()
    })
    const apiHandler = vi.fn((req: any, res: any) => { callOrder.push('api'); res.end('ok') })
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [{ name: 'test', handler: smHandler }] }
      return { apiRoutes: [{ path: '/api/health', handlers: { get: apiHandler } }] }
    })
    configureCerDevServer(server as any, makeConfig())
    await getMiddleware()(createReq({ url: '/api/health' }), createRes(), vi.fn())
    expect(callOrder).toEqual(['sm', 'api'])
  })

  it('stops processing when server middleware does not call next()', async () => {
    const smHandler = vi.fn((_req: any, res: any) => { res.end('blocked') }) // no next() call
    const apiHandler = vi.fn()
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [{ name: 'block', handler: smHandler }] }
      return { apiRoutes: [{ path: '/api/health', handlers: { get: apiHandler } }] }
    })
    configureCerDevServer(server as any, makeConfig())
    await getMiddleware()(createReq({ url: '/api/health' }), createRes(), vi.fn())
    expect(apiHandler).not.toHaveBeenCalled()
  })

  it('sends 500 and stops chain when middleware calls next(err)', async () => {
    const smHandler = vi.fn((_req: any, _res: any, next: (err?: unknown) => void) => {
      next(new Error('auth failed'))
    })
    const apiHandler = vi.fn()
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [{ name: 'err', handler: smHandler }] }
      return { apiRoutes: [{ path: '/api/health', handlers: { get: apiHandler } }] }
    })
    configureCerDevServer(server as any, makeConfig())
    const res = createRes()
    await getMiddleware()(createReq({ url: '/api/health' }), res, vi.fn())
    expect(res.statusCode).toBe(500)
    expect(res.end).toHaveBeenCalledWith('Internal Server Error')
    expect(apiHandler).not.toHaveBeenCalled()
  })

  it('sends 500 and stops chain when middleware throws', async () => {
    const smHandler = vi.fn(() => { throw new Error('unexpected') })
    const apiHandler = vi.fn()
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [{ name: 'throw', handler: smHandler }] }
      return { apiRoutes: [{ path: '/api/health', handlers: { get: apiHandler } }] }
    })
    configureCerDevServer(server as any, makeConfig())
    const res = createRes()
    await getMiddleware()(createReq({ url: '/api/health' }), res, vi.fn())
    expect(res.statusCode).toBe(500)
    expect(apiHandler).not.toHaveBeenCalled()
  })

  it('handles async middleware that returns a Promise and calls next() after awaiting', async () => {
    const callOrder: string[] = []
    const smHandler = vi.fn((_req: any, _res: any, next: () => void) =>
      new Promise<void>((resolve) => {
        // Simulate async work before calling next
        setImmediate(() => { callOrder.push('sm'); next(); resolve() })
      }),
    )
    const apiHandler = vi.fn((_req: any, res: any) => { callOrder.push('api'); res.end('ok') })
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [{ name: 'async', handler: smHandler }] }
      return { apiRoutes: [{ path: '/api/health', handlers: { get: apiHandler } }] }
    })
    configureCerDevServer(server as any, makeConfig())
    await getMiddleware()(createReq({ url: '/api/health' }), createRes(), vi.fn())
    expect(callOrder).toEqual(['sm', 'api'])
  })

  it('handles async middleware that rejects (returns a rejected Promise)', async () => {
    const smHandler = vi.fn(() => Promise.reject(new Error('async failure')))
    const apiHandler = vi.fn()
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [{ name: 'async-throw', handler: smHandler }] }
      return { apiRoutes: [{ path: '/api/health', handlers: { get: apiHandler } }] }
    })
    configureCerDevServer(server as any, makeConfig())
    const res = createRes()
    await getMiddleware()(createReq({ url: '/api/health' }), res, vi.fn())
    expect(res.statusCode).toBe(500)
    expect(apiHandler).not.toHaveBeenCalled()
  })
})

// ─── SSR mode ─────────────────────────────────────────────────────────────────

describe('configureCerDevServer — SSR mode', () => {
  it('invokes SSR handler for HTML requests in ssr mode', async () => {
    const ssrHandler = vi.fn(async (req: any, res: any) => res.end('<html>SSR</html>'))
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      if (path.includes('server-api')) return { apiRoutes: [] }
      // SSR entry module
      return { handler: ssrHandler }
    })
    configureCerDevServer(server as any, makeConfig({ mode: 'ssr' }))
    const res = createRes()
    await getMiddleware()(
      createReq({ url: '/', headers: { accept: 'text/html' } }),
      res,
      vi.fn(),
    )
    expect(ssrHandler).toHaveBeenCalled()
  })

  it('invokes SSR handler for HTML requests in ssg mode', async () => {
    const ssrHandler = vi.fn(async (req: any, res: any) => res.end('<html>SSG-DEV</html>'))
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      if (path.includes('server-api')) return { apiRoutes: [] }
      return { handler: ssrHandler }
    })
    configureCerDevServer(server as any, makeConfig({ mode: 'ssg' }))
    const res = createRes()
    await getMiddleware()(
      createReq({ url: '/', headers: { accept: 'text/html' } }),
      res,
      vi.fn(),
    )
    expect(ssrHandler).toHaveBeenCalled()
  })

  it('does not invoke SSR handler in spa mode', async () => {
    const ssrHandler = vi.fn()
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      if (path.includes('server-api')) return { apiRoutes: [] }
      return { handler: ssrHandler }
    })
    server.transformIndexHtml.mockResolvedValue('<html>spa shell</html>')
    configureCerDevServer(
      server as any,
      makeConfig({ root: HTML_SHELL_ROOT, mode: 'spa' }),
    )
    const next = vi.fn()
    const res = createRes()
    await getMiddleware()(
      createReq({ url: '/', headers: { accept: 'text/html' } }),
      res,
      next,
    )
    expect(ssrHandler).not.toHaveBeenCalled()
    expect(res.end).toHaveBeenCalledWith('<html>spa shell</html>')
    expect(next).not.toHaveBeenCalled()
  })

  it('does not invoke SSR handler for non-HTML requests (e.g. assets)', async () => {
    const ssrHandler = vi.fn()
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      if (path.includes('server-api')) return { apiRoutes: [] }
      return { handler: ssrHandler }
    })
    configureCerDevServer(server as any, makeConfig({ mode: 'ssr' }))
    const next = vi.fn()
    await getMiddleware()(
      createReq({ url: '/assets/main.js', headers: { accept: 'application/javascript' } }),
      createRes(),
      next,
    )
    expect(ssrHandler).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it('does not invoke SSR handler for non-HTML requests in ssg mode', async () => {
    const ssrHandler = vi.fn()
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      if (path.includes('server-api')) return { apiRoutes: [] }
      return { handler: ssrHandler }
    })
    configureCerDevServer(server as any, makeConfig({ mode: 'ssg' }))
    const next = vi.fn()
    await getMiddleware()(
      createReq({ url: '/assets/main.js', headers: { accept: 'application/javascript' } }),
      createRes(),
      next,
    )
    expect(ssrHandler).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalled()
  })

  it('returns 500 and error text when SSR handler throws', async () => {
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      if (path.includes('server-api')) return { apiRoutes: [] }
      return { handler: async () => { throw new Error('render failed') } }
    })
    configureCerDevServer(server as any, makeConfig({ mode: 'ssr' }))
    const res = createRes()
    await getMiddleware()(createReq({ url: '/', headers: { accept: 'text/html' } }), res, vi.fn())
    expect(res.statusCode).toBe(500)
  })

  it('calls next() for non-HTML in ssr mode without API match', async () => {
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      return { apiRoutes: [] }
    })
    configureCerDevServer(server as any, makeConfig({ mode: 'ssr' }))
    const next = vi.fn()
    await getMiddleware()(
      createReq({ url: '/favicon.ico', headers: { accept: 'image/x-icon' } }),
      createRes(),
      next,
    )
    expect(next).toHaveBeenCalled()
  })

  it('uses renderFn fallback when SSR entry exports render instead of handler', async () => {
    const renderFn = vi.fn().mockResolvedValue({ html: '<div>rendered</div>' })
    const { server, getMiddleware } = makeServer()
    ;(server as any).transformIndexHtml = vi.fn().mockResolvedValue(
      '<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    )
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      if (path.includes('server-api')) return { apiRoutes: [] }
      return { render: renderFn }
    })
    configureCerDevServer(server as any, makeConfig({ mode: 'ssr' }))
    const res = createRes()
    await getMiddleware()(createReq({ url: '/', headers: { accept: 'text/html' } }), res, vi.fn())
    expect(renderFn).toHaveBeenCalled()
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('<div>rendered</div>'))
  })

  it('accepts html request when url is / even without text/html accept header', async () => {
    const ssrHandler = vi.fn(async (req: any, res: any) => res.end('<html>home</html>'))
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      if (path.includes('server-api')) return { apiRoutes: [] }
      return { handler: ssrHandler }
    })
    configureCerDevServer(server as any, makeConfig({ mode: 'ssr' }))
    // url='/' triggers acceptsHtml without needing accept header
    await getMiddleware()(createReq({ url: '/' }), createRes(), vi.fn())
    expect(ssrHandler).toHaveBeenCalled()
  })
})

// ─── Per-route render mode (SSR/SSG mode) ────────────────────────────────────

describe("configureCerDevServer — per-route render mode in SSR", () => {
  /** Build a server where virtual:cer-routes returns the given routes array. */
  function makeServerWithRoutes(
    pageRoutes: Array<{ path: string; meta?: Record<string, unknown> }>,
    ssrHandler = vi.fn(async (_req: any, res: any) => res.end('<html>SSR</html>')),
    mode: 'ssr' | 'ssg' = 'ssr',
  ) {
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      if (path.includes('server-api') || path.includes('cer-server-api')) return { apiRoutes: [] }
      if (path.includes('cer-routes')) return { default: pageRoutes }
      return { handler: ssrHandler }
    })
    configureCerDevServer(server as any, makeConfig({ mode }))
    return { middleware: getMiddleware(), ssrHandler }
  }

  it("calls next() instead of SSR for a route with render: 'spa'", async () => {
    const { middleware, ssrHandler } = makeServerWithRoutes([
      { path: '/spa-page', meta: { render: 'spa' } },
    ])
    const next = vi.fn()
    await middleware(
      createReq({ url: '/spa-page', headers: { accept: 'text/html' } }),
      createRes(),
      next,
    )
    expect(next).toHaveBeenCalled()
    expect(ssrHandler).not.toHaveBeenCalled()
  })

  it("calls next() instead of SSR for a route with render: 'spa' in ssg mode", async () => {
    const { middleware, ssrHandler } = makeServerWithRoutes(
      [{ path: '/spa-page', meta: { render: 'spa' } }],
      vi.fn(async (_req: any, res: any) => res.end('<html>SSG</html>')),
      'ssg',
    )
    const next = vi.fn()
    await middleware(
      createReq({ url: '/spa-page', headers: { accept: 'text/html' } }),
      createRes(),
      next,
    )
    expect(next).toHaveBeenCalled()
    expect(ssrHandler).not.toHaveBeenCalled()
  })

  it("proceeds to SSR for a route with render: 'server'", async () => {
    const { middleware, ssrHandler } = makeServerWithRoutes([
      { path: '/server-page', meta: { render: 'server' } },
    ])
    await middleware(
      createReq({ url: '/server-page', headers: { accept: 'text/html' } }),
      createRes(),
      vi.fn(),
    )
    expect(ssrHandler).toHaveBeenCalled()
  })

  it("proceeds to SSR for a route with no render meta", async () => {
    const { middleware, ssrHandler } = makeServerWithRoutes([
      { path: '/normal-page' },
    ])
    await middleware(
      createReq({ url: '/normal-page', headers: { accept: 'text/html' } }),
      createRes(),
      vi.fn(),
    )
    expect(ssrHandler).toHaveBeenCalled()
  })

  it("falls back to SSR when routes module throws during render mode check", async () => {
    const ssrHandler = vi.fn(async (_req: any, res: any) => res.end('<html>SSR</html>'))
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      if (path.includes('server-api') || path.includes('cer-server-api')) return { apiRoutes: [] }
      if (path.includes('cer-routes')) throw new Error('module not ready')
      return { handler: ssrHandler }
    })
    configureCerDevServer(server as any, makeConfig({ mode: 'ssr' }))
    await getMiddleware()(
      createReq({ url: '/some-page', headers: { accept: 'text/html' } }),
      createRes(),
      vi.fn(),
    )
    // Despite the routes module throwing, SSR should still run
    expect(ssrHandler).toHaveBeenCalled()
  })

  it("does not load routes module in SPA mode (no render mode check needed)", async () => {
    const { server, getMiddleware } = makeServer()
    configureCerDevServer(server as any, makeConfig({ mode: 'spa' }))
    await getMiddleware()(
      createReq({ url: '/about', headers: { accept: 'text/html' } }),
      createRes(),
      vi.fn(),
    )
    const routesCalls = (server.ssrLoadModule as any).mock.calls.filter(
      ([p]: [string]) => p.includes('cer-routes'),
    )
    expect(routesCalls).toHaveLength(0)
  })

  it("loads routes module in ssg mode to check per-route render mode", async () => {
    const ssrHandler = vi.fn(async (_req: any, res: any) => res.end('<html>SSG</html>'))
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      if (path.includes('server-api') || path.includes('cer-server-api')) return { apiRoutes: [] }
      if (path.includes('cer-routes')) return { default: [] }
      return { handler: ssrHandler }
    })
    configureCerDevServer(server as any, makeConfig({ mode: 'ssg' }))
    await getMiddleware()(
      createReq({ url: '/about', headers: { accept: 'text/html' } }),
      createRes(),
      vi.fn(),
    )
    const routesCalls = (server.ssrLoadModule as any).mock.calls.filter(
      ([p]: [string]) => p.includes('cer-routes'),
    )
    expect(routesCalls.length).toBeGreaterThan(0)
  })
})

// ─── parseBody edge cases ─────────────────────────────────────────────────────

describe('configureCerDevServer — malformed JSON body', () => {
  it('returns undefined when POST body is malformed JSON', async () => {
    let capturedBody: unknown = 'sentinel'
    const { server, getMiddleware } = makeServer()
    server.ssrLoadModule.mockImplementation(async (path: string) => {
      if (path.includes('server-middleware')) return { serverMiddleware: [] }
      return {
        apiRoutes: [{
          path: '/api/items',
          handlers: { post: (req: any, res: any) => { capturedBody = req.body; res.end('ok') } },
        }],
      }
    })
    configureCerDevServer(server as any, makeConfig())
    const req = createReq({
      url: '/api/items',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ invalid json }',
    })
    await getMiddleware()(req, createRes(), vi.fn())
    expect(capturedBody).toBeUndefined()
  })
})
