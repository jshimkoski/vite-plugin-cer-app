import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'pathe'
import { tmpdir } from 'node:os'
import { runNetlifyAdapter } from '../../../cli/adapters/netlify.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTempRoot(): string {
  const dir = join(tmpdir(), `cer-netlify-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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

describe('runNetlifyAdapter — SSR mode', () => {
  let root: string

  beforeEach(() => {
    root = createTempRoot()
    writeFile(root, 'dist/server/server.js', '// server bundle')
    writeFile(root, 'dist/client/index.html', '<html></html>')
    writeFile(root, 'dist/client/assets/main-abc.js', '// asset')
    writeFile(root, 'dist/client/favicon.ico', 'ico')
    // No ssg-manifest.json → SSR mode
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('writes netlify/functions/ssr.mjs', async () => {
    await runNetlifyAdapter(root)
    expect(existsSync(join(root, 'netlify/functions/ssr.mjs'))).toBe(true)
  })

  it('bridge imports from dist/server/server.js (relative from function location)', async () => {
    await runNetlifyAdapter(root)
    const bridge = readText(root, 'netlify/functions/ssr.mjs')
    expect(bridge).toContain("from '../../dist/server/server.js'")
  })



  it('bridge exports a default async function', async () => {
    await runNetlifyAdapter(root)
    const bridge = readText(root, 'netlify/functions/ssr.mjs')
    expect(bridge).toContain('export default async')
  })

  it('bridge converts Web Request to Node.js-style request (toNodeRequest)', async () => {
    await runNetlifyAdapter(root)
    const bridge = readText(root, 'netlify/functions/ssr.mjs')
    expect(bridge).toContain('toNodeRequest')
    expect(bridge).toContain("from 'node:stream'")
  })

  it('bridge returns a streaming Web API Response (TransformStream body)', async () => {
    await runNetlifyAdapter(root)
    const bridge = readText(root, 'netlify/functions/ssr.mjs')
    expect(bridge).toContain('new Response(bodyless ? null : readable,')
    expect(bridge).toContain('TransformStream')
    expect(bridge).not.toContain('Buffer.concat')
  })

  it('streaming Response carries status code and accumulated response headers', async () => {
    await runNetlifyAdapter(root)
    const bridge = readText(root, 'netlify/functions/ssr.mjs')
    // end() resolves with new Response(readable, { status: res.statusCode, headers: responseHeaders })
    expect(bridge).toContain('res.statusCode')
    expect(bridge).toContain('{ status: res.statusCode, headers: responseHeaders }')
  })

  it('bridge streams chunks via writer.write() instead of buffering', async () => {
    await runNetlifyAdapter(root)
    const bridge = readText(root, 'netlify/functions/ssr.mjs')
    expect(bridge).toContain('writer.write(')
    expect(bridge).toContain('writer.close()')
  })

  it('bridge uses TextEncoder to convert string chunks to Uint8Array', async () => {
    await runNetlifyAdapter(root)
    const bridge = readText(root, 'netlify/functions/ssr.mjs')
    expect(bridge).toContain('encoder.encode(chunk)')
    expect(bridge).toContain('new TextEncoder()')
  })

  it('bridge silently swallows writer rejections to prevent UnhandledPromiseRejection on client disconnect', async () => {
    await runNetlifyAdapter(root)
    const bridge = readText(root, 'netlify/functions/ssr.mjs')
    expect(bridge).toContain('.catch(() => {})')
    expect(bridge).toContain('writer.abort(error).catch(() => {})')
  })





  it('bridge mock res has writableEnded guard to prevent double end()', async () => {
    await runNetlifyAdapter(root)
    const bridge = readText(root, 'netlify/functions/ssr.mjs')
    expect(bridge).toContain('writableEnded')
    expect(bridge).toContain('if (_ended) return this')
  })

  it('writes netlify.toml', async () => {
    await runNetlifyAdapter(root)
    expect(existsSync(join(root, 'netlify.toml'))).toBe(true)
  })

  it('netlify.toml publish points to .netlify/publish', async () => {
    await runNetlifyAdapter(root)
    const toml = readText(root, 'netlify.toml')
    expect(toml).toContain('publish = ".netlify/publish"')
  })

  it('netlify.toml has catch-all redirect to /.netlify/functions/ssr', async () => {
    await runNetlifyAdapter(root)
    const toml = readText(root, 'netlify.toml')
    expect(toml).toContain('to = "/.netlify/functions/ssr"')
    expect(toml).toContain('status = 200')
  })

  it('netlify.toml sets immutable Cache-Control header for /assets/*', async () => {
    await runNetlifyAdapter(root)
    const toml = readText(root, 'netlify.toml')
    expect(toml).toContain('for = "/assets/*"')
    expect(toml).toContain('public, max-age=31536000, immutable')
  })

  it('copies content-hashed assets to .netlify/publish/assets/', async () => {
    await runNetlifyAdapter(root)
    expect(existsSync(join(root, '.netlify/publish/assets/main-abc.js'))).toBe(true)
  })

  it('copies other public files (favicon.ico) to .netlify/publish/', async () => {
    await runNetlifyAdapter(root)
    expect(existsSync(join(root, '.netlify/publish/favicon.ico'))).toBe(true)
  })

  it('does NOT copy index.html to .netlify/publish/ (handled by SSR function)', async () => {
    await runNetlifyAdapter(root)
    expect(existsSync(join(root, '.netlify/publish/index.html'))).toBe(false)
  })

  it('cleans existing .netlify/publish/ before writing', async () => {
    writeFile(root, '.netlify/publish/stale.txt', 'old')
    await runNetlifyAdapter(root)
    expect(existsSync(join(root, '.netlify/publish/stale.txt'))).toBe(false)
  })

  it('throws if dist/ does not exist', async () => {
    rmSync(join(root, 'dist'), { recursive: true, force: true })
    await expect(runNetlifyAdapter(root)).rejects.toThrow("Run 'cer-app build' first")
  })
})

// ─── SPA mode ────────────────────────────────────────────────────────────────

describe('runNetlifyAdapter — SPA mode', () => {
  let root: string

  beforeEach(() => {
    root = createTempRoot()
    writeFile(root, 'dist/index.html', '<html></html>')
    writeFile(root, 'dist/assets/app-abc.js', '// app')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('does NOT write netlify/functions/ssr.mjs', async () => {
    await runNetlifyAdapter(root)
    expect(existsSync(join(root, 'netlify/functions/ssr.mjs'))).toBe(false)
  })

  it('writes netlify.toml with publish = "dist"', async () => {
    await runNetlifyAdapter(root)
    const toml = readText(root, 'netlify.toml')
    expect(toml).toContain('publish = "dist"')
  })

  it('netlify.toml has SPA fallback redirect to /index.html', async () => {
    await runNetlifyAdapter(root)
    const toml = readText(root, 'netlify.toml')
    expect(toml).toContain('to = "/index.html"')
    expect(toml).toContain('status = 200')
  })
})

// ─── SSG mode ────────────────────────────────────────────────────────────────

describe('runNetlifyAdapter — SSG mode', () => {
  let root: string

  beforeEach(() => {
    root = createTempRoot()
    writeFile(root, 'dist/server/server.js', '// server bundle')
    writeFile(root, 'dist/ssg-manifest.json', '{}')
    writeFile(root, 'dist/index.html', '<html>root</html>')
    writeFile(root, 'dist/about/index.html', '<html>about</html>')
    writeFile(root, 'dist/client/index.html', '<html>shell</html>')
    writeFile(root, 'dist/client/assets/main-abc.js', '// asset')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('does NOT write netlify/functions/ssr.mjs', async () => {
    await runNetlifyAdapter(root)
    expect(existsSync(join(root, 'netlify/functions/ssr.mjs'))).toBe(false)
  })

  it('copies pre-rendered HTML to .netlify/publish/', async () => {
    await runNetlifyAdapter(root)
    expect(existsSync(join(root, '.netlify/publish/index.html'))).toBe(true)
    expect(existsSync(join(root, '.netlify/publish/about/index.html'))).toBe(true)
  })

  it('copies assets to .netlify/publish/assets/', async () => {
    await runNetlifyAdapter(root)
    expect(existsSync(join(root, '.netlify/publish/assets/main-abc.js'))).toBe(true)
  })

  it('does NOT copy ssg-manifest.json to publish dir', async () => {
    await runNetlifyAdapter(root)
    expect(existsSync(join(root, '.netlify/publish/ssg-manifest.json'))).toBe(false)
  })

  it('filters manifests even when pure SSG already pruned the client directory', async () => {
    rmSync(join(root, 'dist/client'), { recursive: true, force: true })
    writeFile(root, 'dist/assets/main-abc.js', '// asset')
    await runNetlifyAdapter(root)
    expect(existsSync(join(root, '.netlify/publish/ssg-manifest.json'))).toBe(false)
    expect(existsSync(join(root, '.netlify/publish/assets/main-abc.js'))).toBe(true)
    expect(readText(root, 'netlify.toml')).toContain('publish = ".netlify/publish"')
  })

  it('netlify.toml serves the shell with a 404 status for unmatched SSG paths', async () => {
    await runNetlifyAdapter(root)
    const toml = readText(root, 'netlify.toml')
    expect(toml).toContain('to = "/404.html"')
    expect(toml).toContain('status = 404')
  })
})
