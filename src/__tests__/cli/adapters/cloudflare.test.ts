import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'pathe'
import { tmpdir } from 'node:os'
import { runCloudflareAdapter } from '../../../cli/adapters/cloudflare.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTempRoot(): string {
  const dir = join(tmpdir(), `cer-cf-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeFile(root: string, rel: string, content = 'content'): void {
  const full = join(root, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

function readText(root: string, rel: string): string {
  return readFileSync(join(root, rel), 'utf-8')
}

// ─── SSR mode ────────────────────────────────────────────────────────────────

describe('runCloudflareAdapter — SSR mode', () => {
  let root: string

  beforeEach(() => {
    root = createTempRoot()
    writeFile(root, 'dist/server/server.js', '// server bundle')
    writeFile(root, 'dist/client/index.html', '<html><body>client shell</body></html>')
    writeFile(root, 'dist/client/assets/main-abc.js', '// asset')
    writeFile(root, 'dist/client/favicon.ico', 'ico')
    // No ssg-manifest.json → SSR mode
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('writes dist/_worker.js', async () => {
    await runCloudflareAdapter(root)
    expect(existsSync(join(root, 'dist/_worker.js'))).toBe(true)
  })

  it('worker imports from ./server/server.js', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain("await import('./server/server.js')")
  })

  it('worker exports a fetch handler (Cloudflare module format)', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain('export default')
    expect(worker).toContain('async fetch(')
  })

  it('worker inlines the client HTML template via globalThis.__CER_CLIENT_TEMPLATE__', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain('globalThis.__CER_CLIENT_TEMPLATE__')
    expect(worker).toContain('client shell')
  })

  it('worker uses top-level await dynamic import for server bundle', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain("await import('./server/server.js')")
  })

  it('worker imports Readable from node:stream (nodejs_compat)', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain("from 'node:stream'")
    expect(worker).toContain('Readable')
  })

  it('worker imports isrHandler and uses it for SSR fallback (enables ISR stale-while-revalidate)', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain('isrHandler')
    expect(worker).toContain('isrHandler(nodeReq, res)')
  })

  it('worker handles /api/* routing via matchApiPattern', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain("urlPath.startsWith('/api/')")
    expect(worker).toContain('matchApiPattern')
    expect(worker).toContain('apiRoutes')
  })

  it('worker calls runServerMiddleware before dispatching', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain('runServerMiddleware')
  })

  it('worker mock res has writableEnded guard', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain('writableEnded')
    expect(worker).toContain('if (_ended) return')
  })

  it('worker returns a streaming Web API Response (TransformStream body)', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain('new Response(readable,')
    expect(worker).toContain('TransformStream')
    expect(worker).not.toContain('Buffer.concat')
  })

  it('worker streams chunks via writer.write() instead of buffering', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain('writer.write(')
    expect(worker).toContain('writer.close()')
  })

  it('worker uses TextEncoder to convert string chunks to Uint8Array', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain('encoder.encode(chunk)')
    expect(worker).toContain('new TextEncoder()')
  })

  it('worker silently swallows writer rejections to prevent UnhandledPromiseRejection on client disconnect', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain('.catch(() => {})')
    expect(worker).toContain('writer.close().catch(() => {})')
  })

  it('worker wraps API handlers in runWithRequestContext for cookie/session access', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain('runWithRequestContext')
    expect(worker).toContain('runWithRequestContext(nodeReq, res, () => Promise.resolve(fn(nodeReq, res)))')
  })

  it('worker attaches req.query (parsed query string) in toNodeRequest', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain('parseQuery')
    expect(worker).toContain('req.query = parseQuery(')
  })

  it('worker attaches req.body (parsed JSON body) in toNodeRequest', async () => {
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    expect(worker).toContain('req.body =')
    expect(worker).toContain("'application/json'")
    expect(worker).toContain('JSON.parse(')
  })

  it('copies content-hashed assets to dist/assets/', async () => {
    await runCloudflareAdapter(root)
    expect(existsSync(join(root, 'dist/assets/main-abc.js'))).toBe(true)
  })

  it('copies other public files (favicon.ico) to dist/', async () => {
    await runCloudflareAdapter(root)
    expect(existsSync(join(root, 'dist/favicon.ico'))).toBe(true)
  })

  it('does NOT copy index.html to dist/ root (handled by SSR worker)', async () => {
    await runCloudflareAdapter(root)
    // The original dist/client/index.html should NOT be copied to dist/index.html
    // (_worker.js handles all HTML requests)
    const workerExists = existsSync(join(root, 'dist/_worker.js'))
    expect(workerExists).toBe(true)
    // index.html at dist root would clash with worker; confirm it's absent
    expect(existsSync(join(root, 'dist/index.html'))).toBe(false)
  })

  it('writes wrangler.toml', async () => {
    await runCloudflareAdapter(root)
    expect(existsSync(join(root, 'wrangler.toml'))).toBe(true)
  })

  it('wrangler.toml includes nodejs_compat compatibility flag', async () => {
    await runCloudflareAdapter(root)
    const toml = readText(root, 'wrangler.toml')
    expect(toml).toContain('nodejs_compat')
    expect(toml).toContain('compatibility_flags')
  })

  it('wrangler.toml sets pages_build_output_dir to dist', async () => {
    await runCloudflareAdapter(root)
    const toml = readText(root, 'wrangler.toml')
    expect(toml).toContain('dist')
  })

  it('throws if dist/ does not exist', async () => {
    rmSync(join(root, 'dist'), { recursive: true, force: true })
    await expect(runCloudflareAdapter(root)).rejects.toThrow("Run 'cer-app build' first")
  })

  it('worker escapes backticks in the inlined HTML', async () => {
    writeFile(root, 'dist/client/index.html', '<script>const t = `hello`</script>')
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    // The backtick in the HTML must be escaped so the template literal stays valid
    expect(worker).toContain('\\`hello\\`')
  })

  it('worker handles missing client HTML gracefully (empty string)', async () => {
    rmSync(join(root, 'dist/client/index.html'))
    await runCloudflareAdapter(root)
    const worker = readText(root, 'dist/_worker.js')
    // Empty string inlined — worker still generated without error
    expect(worker).toContain('globalThis.__CER_CLIENT_TEMPLATE__')
  })
})

// ─── SPA mode ────────────────────────────────────────────────────────────────

describe('runCloudflareAdapter — SPA mode', () => {
  let root: string

  beforeEach(() => {
    root = createTempRoot()
    writeFile(root, 'dist/index.html', '<html>spa</html>')
    writeFile(root, 'dist/assets/app-abc.js', '// app')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('does NOT write dist/_worker.js', async () => {
    await runCloudflareAdapter(root)
    expect(existsSync(join(root, 'dist/_worker.js'))).toBe(false)
  })

  it('writes wrangler.toml without nodejs_compat', async () => {
    await runCloudflareAdapter(root)
    const toml = readText(root, 'wrangler.toml')
    expect(toml).not.toContain('nodejs_compat')
    expect(toml).toContain('dist')
  })
})

// ─── SSG mode ────────────────────────────────────────────────────────────────

describe('runCloudflareAdapter — SSG mode', () => {
  let root: string

  beforeEach(() => {
    root = createTempRoot()
    writeFile(root, 'dist/server/server.js', '// server bundle')
    writeFile(root, 'dist/ssg-manifest.json', '{}')
    writeFile(root, 'dist/index.html', '<html>root ssg</html>')
    writeFile(root, 'dist/about/index.html', '<html>about ssg</html>')
    writeFile(root, 'dist/client/index.html', '<html>shell</html>')
    writeFile(root, 'dist/client/assets/main-abc.js', '// asset')
  })

  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('does NOT write dist/_worker.js', async () => {
    await runCloudflareAdapter(root)
    expect(existsSync(join(root, 'dist/_worker.js'))).toBe(false)
  })

  it('copies assets from dist/client/ to dist/assets/', async () => {
    await runCloudflareAdapter(root)
    expect(existsSync(join(root, 'dist/assets/main-abc.js'))).toBe(true)
  })

  it('wrangler.toml does not include nodejs_compat', async () => {
    await runCloudflareAdapter(root)
    const toml = readText(root, 'wrangler.toml')
    expect(toml).not.toContain('nodejs_compat')
  })
})
