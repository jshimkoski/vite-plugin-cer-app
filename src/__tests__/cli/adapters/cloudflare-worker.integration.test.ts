/**
 * Cloudflare Pages worker — integration tests.
 *
 * These tests exercise the full request/response pipeline through the generated
 * `dist/_worker.js`: Web API Request → server middleware → API route handler
 * / SSR handler → buffered Web API Response.
 *
 * Prerequisites (run automatically via `npm run e2e:integration:cloudflare`):
 *   1. `cer-app build --mode ssr --root e2e/kitchen-sink`
 *   2. `cer-app adapt --platform cloudflare --root e2e/kitchen-sink`
 *
 * When the worker does not exist (e.g. during a normal `npm test` run) the
 * entire suite is skipped — no failures, no noise.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'pathe'

// ─── Paths ────────────────────────────────────────────────────────────────────

const KITCHEN_SINK = resolve(import.meta.dirname, '../../../../e2e/kitchen-sink')
const WORKER_PATH = resolve(KITCHEN_SINK, 'dist/_worker.js')
const SERVER_BUNDLE = resolve(KITCHEN_SINK, 'dist/server/server.js')
const workerExists = existsSync(WORKER_PATH) && existsSync(SERVER_BUNDLE)

// ─── Suite ───────────────────────────────────────────────────────────────────

describe.skipIf(!workerExists)('Cloudflare Pages worker — integration', () => {
  type WorkerModule = { default: { fetch(req: Request, env?: unknown, ctx?: unknown): Promise<Response> } }
  let worker: WorkerModule['default']

  beforeAll(async () => {
    const mod = await import(WORKER_PATH) as WorkerModule
    worker = mod.default
  })

  const call = (path: string, init?: RequestInit) =>
    worker.fetch(new Request(`http://localhost${path}`, init))

  // ─── HTML rendering ────────────────────────────────────────────────────────

  it('GET / returns 200 with Content-Type text/html', async () => {
    const res = await call('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('GET / response is a complete HTML document', async () => {
    const res = await call('/')
    const body = await res.text()
    expect(body).toContain('<!DOCTYPE html')
    expect(body).toContain('</html>')
  })

  it('GET / SSR body includes kitchen-sink content', async () => {
    const res = await call('/')
    const body = await res.text()
    expect(body).toContain('Kitchen Sink')
  })

  it('GET /about returns 200 HTML', async () => {
    const res = await call('/about')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<!DOCTYPE html')
  })

  // ─── API routes ───────────────────────────────────────────────────────────

  it('GET /api/health returns 200 JSON {status:"ok"}', async () => {
    const res = await call('/api/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const data = await res.json() as { status: string; service: string }
    expect(data.status).toBe('ok')
    expect(data.service).toBe('kitchen-sink')
  })

  it('GET /api/posts returns 200 JSON array', async () => {
    const res = await call('/api/posts')
    expect(res.status).toBe(200)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  it('GET /api/posts/:slug returns the matching post', async () => {
    const res = await call('/api/posts/first-post')
    expect(res.status).toBe(200)
    const post = await res.json() as { slug: string; title: string }
    expect(post.slug).toBe('first-post')
  })

  it('GET /api/posts/:slug returns 404 for unknown slug', async () => {
    const res = await call('/api/posts/does-not-exist')
    expect(res.status).toBe(404)
  })

  it('GET /api/unknown-route returns 404', async () => {
    const res = await call('/api/unknown-route')
    expect(res.status).toBe(404)
  })

  // ─── Server middleware ────────────────────────────────────────────────────

  it('server middleware injects X-CER-Middleware header', async () => {
    const res = await call('/')
    expect(res.headers.get('x-cer-middleware')).toBe('active')
  })

  it('server middleware runs before API routes (header on /api/health)', async () => {
    const res = await call('/api/health')
    expect(res.headers.get('x-cer-middleware')).toBe('active')
  })

  // ─── Response integrity ───────────────────────────────────────────────────

  it('API response body is valid JSON (not truncated)', async () => {
    const res = await call('/api/posts')
    const text = await res.text()
    expect(() => JSON.parse(text)).not.toThrow()
  })

  it('HTML response body is not empty', async () => {
    const res = await call('/')
    const body = await res.text()
    expect(body.length).toBeGreaterThan(100)
  })
})
