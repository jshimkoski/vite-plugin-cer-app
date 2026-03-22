/**
 * Vercel SSR launcher — integration tests.
 *
 * These tests exercise the full request/response pipeline through the generated
 * `.vercel/output/functions/index.func/index.js` launcher: Node.js req/res →
 * server middleware → API route handler / SSR handler.
 *
 * Prerequisites (run automatically via `npm run e2e:integration:vercel`):
 *   1. `cer-app build --mode ssr --root e2e/kitchen-sink`
 *   2. `cer-app adapt --platform vercel --root e2e/kitchen-sink`
 *
 * When the launcher does not exist (e.g. during a normal `npm test` run) the
 * entire suite is skipped — no failures, no noise.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'pathe'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { AddressInfo } from 'node:net'

// ─── Paths ────────────────────────────────────────────────────────────────────

const KITCHEN_SINK = resolve(import.meta.dirname, '../../../../e2e/kitchen-sink')
const LAUNCHER_PATH = resolve(KITCHEN_SINK, '.vercel/output/functions/index.func/index.js')
const SERVER_BUNDLE = resolve(KITCHEN_SINK, 'dist/server/server.js')
const launcherExists = existsSync(LAUNCHER_PATH) && existsSync(SERVER_BUNDLE)

// ─── Helpers ─────────────────────────────────────────────────────────────────

type LauncherFn = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** Starts a real HTTP server backed by the Vercel launcher and returns its base URL. */
async function startServer(launcher: LauncherFn): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    Promise.resolve(launcher(req, res)).catch((err) => {
      if (!res.headersSent) res.writeHead(500)
      res.end(String(err))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  }
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe.skipIf(!launcherExists)('Vercel SSR launcher — integration', () => {
  let launcher: LauncherFn
  let baseUrl: string
  let closeServer: () => Promise<void>

  beforeAll(async () => {
    const mod = await import(LAUNCHER_PATH)
    launcher = mod.default as LauncherFn
    const srv = await startServer(launcher)
    baseUrl = srv.url
    closeServer = srv.close
  })

  // afterAll not available at top level — server runs for suite duration

  // ─── HTML rendering ────────────────────────────────────────────────────────

  it('GET / returns 200 with Content-Type text/html', async () => {
    const res = await fetch(`${baseUrl}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    await closeServer()
  })

  it('GET / response is a complete HTML document', async () => {
    const srv = await startServer(launcher)
    const res = await fetch(`${srv.url}/`)
    const body = await res.text()
    expect(body).toContain('<!DOCTYPE html')
    expect(body).toContain('</html>')
    await srv.close()
  })

  it('GET / SSR body includes kitchen-sink content', async () => {
    const srv = await startServer(launcher)
    const res = await fetch(`${srv.url}/`)
    const body = await res.text()
    expect(body).toContain('Kitchen Sink')
    await srv.close()
  })

  // ─── API routes ───────────────────────────────────────────────────────────

  it('GET /api/health returns 200 JSON {status:"ok"}', async () => {
    const srv = await startServer(launcher)
    const res = await fetch(`${srv.url}/api/health`)
    expect(res.status).toBe(200)
    const data = await res.json() as { status: string; service: string }
    expect(data.status).toBe('ok')
    expect(data.service).toBe('kitchen-sink')
    await srv.close()
  })

  it('GET /api/posts returns 200 JSON array', async () => {
    const srv = await startServer(launcher)
    const res = await fetch(`${srv.url}/api/posts`)
    expect(res.status).toBe(200)
    const data = await res.json() as unknown[]
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
    await srv.close()
  })

  it('GET /api/unknown-route returns 404', async () => {
    const srv = await startServer(launcher)
    const res = await fetch(`${srv.url}/api/unknown-route`)
    expect(res.status).toBe(404)
    await srv.close()
  })

  // ─── Server middleware ────────────────────────────────────────────────────

  it('server middleware injects X-CER-Middleware header', async () => {
    const srv = await startServer(launcher)
    const res = await fetch(`${srv.url}/`)
    expect(res.headers.get('x-cer-middleware')).toBe('active')
    await srv.close()
  })
})
