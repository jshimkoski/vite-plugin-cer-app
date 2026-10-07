/**
 * Netlify SSR bridge — integration tests.
 *
 * These tests exercise the full request/response pipeline through the generated
 * `netlify/functions/ssr.mjs` bridge: Web API Request → Node.js mock → SSR
 * handler → streaming Web API Response (TransformStream body).
 *
 * Prerequisites (run automatically via `npm run e2e:integration:netlify`):
 *   1. `cer-app build --mode ssr --root e2e/kitchen-sink`   → dist/server/server.js
 *   2. `cer-app adapt --platform netlify --root e2e/kitchen-sink` → netlify/functions/ssr.mjs
 *
 * When the bridge does not exist (e.g. during a normal `npm test` run) the
 * entire suite is skipped — no failures, no noise.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'pathe'

// ─── Paths ────────────────────────────────────────────────────────────────────

const KITCHEN_SINK = resolve(import.meta.dirname, '../../../../e2e/kitchen-sink')
const BRIDGE_PATH = resolve(KITCHEN_SINK, 'netlify/functions/ssr.mjs')
const SERVER_BUNDLE = resolve(KITCHEN_SINK, 'dist/server/server.js')
const bridgeExists = existsSync(BRIDGE_PATH) && existsSync(SERVER_BUNDLE)

// ─── Suite ───────────────────────────────────────────────────────────────────

describe.skipIf(!bridgeExists)('Netlify SSR bridge — integration', () => {
  type BridgeFn = (req: Request) => Promise<Response>
  let bridge: BridgeFn

  beforeAll(async () => {
    delete (globalThis as Record<string, unknown>).__CER_CONTENT_STORE__
    const mod = await import(BRIDGE_PATH)
    bridge = mod.default as BridgeFn
  })

  it('renders content loader data without relying on the project working directory', async () => {
    const response = await bridge(new Request('http://localhost/content-doc'))
    expect(await response.text()).toContain('data-cy="content-doc-title"')
  })

  it('keeps route/query state isolated across concurrent loader awaits and renders', async () => {
    const bodies = await Promise.all(['alpha', 'beta'].map(async token => (await bridge(new Request('http://localhost/route-info?token=' + token))).text()))
    for (const [index, token] of ['alpha', 'beta'].entries()) {
      expect(bodies[index]).toContain('<code>' + token + ':/route-info</code>')
      expect(bodies[index]).toContain('<code>Route Info Page</code>')
    }
  })

  // ─── HTML rendering ─────────────────────────────────────────────────────────

  it('GET / returns 200 with Content-Type text/html', async () => {
    const res = await bridge(new Request('http://localhost/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('GET / response body is a complete HTML document', async () => {
    const res = await bridge(new Request('http://localhost/'))
    // Response body is a ReadableStream (streaming, not pre-buffered).
    expect(res.body).toBeInstanceOf(ReadableStream)
    const body = await res.text()
    expect(body).toContain('<!DOCTYPE html')
    expect(body).toContain('</html>')
  })

  it('GET / SSR body includes page-specific content', async () => {
    const res = await bridge(new Request('http://localhost/'))
    const body = await res.text()
    // The kitchen-sink index page renders a heading with data-cy="home-heading".
    expect(body).toContain('Kitchen Sink')
  })

  it('GET /about returns 200 HTML', async () => {
    const res = await bridge(new Request('http://localhost/about'))
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<!DOCTYPE html')
  })

  // ─── URL passthrough ────────────────────────────────────────────────────────

  it('passes query string to the handler', async () => {
    // The SSR handler uses req.url which includes the query string.
    // We just verify no error is thrown — the handler resolves normally.
    const res = await bridge(new Request('http://localhost/?ref=test&utm_source=vitest'))
    expect(res.status).toBe(200)
  })

  // ─── API routes ─────────────────────────────────────────────────────────────

  it('GET /api/health returns 200 JSON {status:"ok"}', async () => {
    const res = await bridge(new Request('http://localhost/api/health'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const data = await res.json() as { status: string; service: string }
    expect(data.status).toBe('ok')
    expect(data.service).toBe('kitchen-sink')
  })

  it('GET /api/posts returns 200 JSON array', async () => {
    const res = await bridge(new Request('http://localhost/api/posts'))
    expect(res.status).toBe(200)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('GET /api/posts/:slug returns the matching post', async () => {
    const res = await bridge(new Request('http://localhost/api/posts/first-post'))
    expect(res.status).toBe(200)
    const post = await res.json() as { slug: string; title: string }
    expect(post.slug).toBe('first-post')
    expect(post.title).toBe('First Post')
  })

  it('GET /api/posts/:slug returns 404 for unknown slug', async () => {
    const res = await bridge(new Request('http://localhost/api/posts/does-not-exist'))
    expect(res.status).toBe(404)
  })

  it('GET /api/unknown-route returns 404', async () => {
    // No handler registered — the bridge exhausts apiRoutes and returns 404.
    const res = await bridge(new Request('http://localhost/api/unknown-route'))
    expect(res.status).toBe(404)
  })

  // ─── Request method routing ──────────────────────────────────────────────────

  it('routes GET and POST independently — POST /api/health (no handler) returns 405', async () => {
    // The health handler only registers GET. The bridge looks for
    // handlers['post'] ?? handlers['POST'] ?? handlers['default'] — none exist.
    const res = await bridge(new Request('http://localhost/api/health', { method: 'POST' }))
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET')
  })

  // ─── Response integrity ──────────────────────────────────────────────────────
  it('parses streamed JSON bodies and rejects malformed or oversized bodies', async () => {
    const call = (body: string) => bridge(new Request('http://localhost/api/echo', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
    }))
    const valid = await call(JSON.stringify({ message: 'Streamed' }))
    expect(await valid.json()).toEqual({ echo: { message: 'Streamed' } })
    expect((await call('{invalid')).status).toBe(400)
    expect((await call(JSON.stringify({ message: 'x'.repeat(1_048_576) }))).status).toBe(413)
  })
  it('passes query parameters and session cookies through the bridge', async () => {
    const query = await bridge(new Request('http://localhost/api/echo?key=value'))
    expect(await query.json()).toEqual({ query: { key: 'value' } })
    const created = await bridge(new Request('http://localhost/api/session', { method: 'POST' }))
    const cookies = created.headers.getSetCookie()
    expect(cookies.length).toBeGreaterThan(0)
    const session = await bridge(new Request('http://localhost/api/session', {
      headers: { cookie: cookies.map((value) => value.split(';')[0]).join('; ') },
    }))
    expect(await session.json()).toEqual({ userId: 'test-user' })
  })

  it('API response body is valid JSON (not truncated)', async () => {
    const res = await bridge(new Request('http://localhost/api/posts'))
    const text = await res.text()
    // Must parse without throwing — proves the buffer was not cut short.
    expect(() => JSON.parse(text)).not.toThrow()
  })

  it('HTML response body is not empty', async () => {
    const res = await bridge(new Request('http://localhost/'))
    const body = await res.text()
    expect(body.length).toBeGreaterThan(100)
  })
})
