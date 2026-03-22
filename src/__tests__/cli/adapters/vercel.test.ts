import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'pathe'
import { tmpdir } from 'node:os'
import { runVercelAdapter } from '../../../cli/adapters/vercel.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTempRoot(): string {
  const dir = join(tmpdir(), `cer-vercel-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeFile(root: string, rel: string, content = 'content'): void {
  const full = join(root, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

function readJson(root: string, rel: string): unknown {
  return JSON.parse(readFileSync(join(root, rel), 'utf-8'))
}

function readText(root: string, rel: string): string {
  return readFileSync(join(root, rel), 'utf-8')
}

// ─── SSR mode ────────────────────────────────────────────────────────────────

describe('runVercelAdapter — SSR mode', () => {
  let root: string

  beforeEach(() => {
    root = createTempRoot()
    // dist/server/server.js → SSR bundle
    writeFile(root, 'dist/server/server.js', '// server bundle')
    // dist/client/index.html → HTML template
    writeFile(root, 'dist/client/index.html', '<html></html>')
    // dist/client/assets/main-abc.js → content-hashed asset
    writeFile(root, 'dist/client/assets/main-abc.js', '// asset')
    // dist/client/favicon.ico → public file
    writeFile(root, 'dist/client/favicon.ico', 'ico')
    // No ssg-manifest.json → SSR mode
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('creates .vercel/output/config.json with version 3', async () => {
    await runVercelAdapter(root)
    const cfg = readJson(root, '.vercel/output/config.json') as { version: number }
    expect(cfg.version).toBe(3)
  })

  it('config.json routes include immutable cache for /assets/', async () => {
    await runVercelAdapter(root)
    const cfg = readJson(root, '.vercel/output/config.json') as {
      routes: Array<{ src?: string; headers?: Record<string, string>; handle?: string; dest?: string }>
    }
    const assetRoute = cfg.routes.find((r) => r.src === '/assets/(.*)')
    expect(assetRoute).toBeDefined()
    expect(assetRoute!.headers!['cache-control']).toBe('public, max-age=31536000, immutable')
  })

  it('config.json routes include filesystem handler', async () => {
    await runVercelAdapter(root)
    const cfg = readJson(root, '.vercel/output/config.json') as {
      routes: Array<{ handle?: string }>
    }
    expect(cfg.routes.some((r) => r.handle === 'filesystem')).toBe(true)
  })

  it('config.json routes fall through to /index for SSR catch-all', async () => {
    await runVercelAdapter(root)
    const cfg = readJson(root, '.vercel/output/config.json') as {
      routes: Array<{ src?: string; dest?: string }>
    }
    const catchAll = cfg.routes.find((r) => r.src === '/(.*)' && r.dest === '/index')
    expect(catchAll).toBeDefined()
  })

  it('copies server bundle to functions/index.func/server/server.js', async () => {
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/functions/index.func/server/server.js'))).toBe(true)
  })

  it('copies client HTML to functions/index.func/client/index.html', async () => {
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/functions/index.func/client/index.html'))).toBe(true)
    expect(readText(root, '.vercel/output/functions/index.func/client/index.html')).toBe('<html></html>')
  })

  it('writes launcher at functions/index.func/index.js', async () => {
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/functions/index.func/index.js'))).toBe(true)
    const launcher = readText(root, '.vercel/output/functions/index.func/index.js')
    expect(launcher).toContain("import { handler, isrHandler, apiRoutes, runServerMiddleware, runWithRequestContext } from './server/server.js'")
    expect(launcher).toContain('export default async function cerAppHandler')
  })

  it('launcher uses isrHandler for SSR fallback (enables ISR stale-while-revalidate)', async () => {
    await runVercelAdapter(root)
    const launcher = readText(root, '.vercel/output/functions/index.func/index.js')
    expect(launcher).toContain('isrHandler')
    expect(launcher).toContain('await isrHandler(req, res)')
  })

  it('launcher routes /api/* requests to apiRoutes', async () => {
    await runVercelAdapter(root)
    const launcher = readText(root, '.vercel/output/functions/index.func/index.js')
    expect(launcher).toContain("urlPath.startsWith('/api/')")
    expect(launcher).toContain('matchApiPattern')
  })

  it('launcher attaches req.query (parsed query string) before calling handler', async () => {
    await runVercelAdapter(root)
    const launcher = readText(root, '.vercel/output/functions/index.func/index.js')
    expect(launcher).toContain('parseQuery')
    expect(launcher).toContain('req.query = parseQuery(')
  })

  it('launcher attaches req.body (parsed JSON body) before calling handler', async () => {
    await runVercelAdapter(root)
    const launcher = readText(root, '.vercel/output/functions/index.func/index.js')
    expect(launcher).toContain('parseBody')
    expect(launcher).toContain('req.body = await parseBody(req)')
  })

  it('writes package.json with type:module in function dir', async () => {
    await runVercelAdapter(root)
    const pkg = readJson(root, '.vercel/output/functions/index.func/package.json') as { type: string }
    expect(pkg.type).toBe('module')
  })

  it('writes .vc-config.json with nodejs20.x runtime', async () => {
    await runVercelAdapter(root)
    const vc = readJson(root, '.vercel/output/functions/index.func/.vc-config.json') as {
      runtime: string
      handler: string
      launcherType: string
    }
    expect(vc.runtime).toBe('nodejs20.x')
    expect(vc.handler).toBe('index.js')
    expect(vc.launcherType).toBe('Nodejs')
  })

  it('copies content-hashed assets to static/assets/', async () => {
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/static/assets/main-abc.js'))).toBe(true)
  })

  it('copies other public files (favicon.ico) to static/', async () => {
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/static/favicon.ico'))).toBe(true)
  })

  it('does NOT copy index.html to static/ (served by SSR function)', async () => {
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/static/index.html'))).toBe(false)
  })

  it('cleans existing .vercel/output/ before writing', async () => {
    // Write a stale file that should be removed.
    writeFile(root, '.vercel/output/stale-file.txt', 'old')
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/stale-file.txt'))).toBe(false)
  })

  it('throws if dist/ does not exist', async () => {
    rmSync(join(root, 'dist'), { recursive: true, force: true })
    await expect(runVercelAdapter(root)).rejects.toThrow("Run 'cer-app build' first")
  })
})

// ─── SPA mode ────────────────────────────────────────────────────────────────

describe('runVercelAdapter — SPA mode', () => {
  let root: string

  beforeEach(() => {
    root = createTempRoot()
    // SPA: no server bundle, all files flat in dist/
    writeFile(root, 'dist/index.html', '<html></html>')
    writeFile(root, 'dist/assets/app-abc.js', '// app')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('copies dist/ to static/', async () => {
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/static/index.html'))).toBe(true)
    expect(existsSync(join(root, '.vercel/output/static/assets/app-abc.js'))).toBe(true)
  })

  it('config.json SPA fallback routes to /index.html', async () => {
    await runVercelAdapter(root)
    const cfg = readJson(root, '.vercel/output/config.json') as {
      routes: Array<{ src?: string; dest?: string }>
    }
    const fallback = cfg.routes.find((r) => r.src === '/(.*)' && r.dest === '/index.html')
    expect(fallback).toBeDefined()
  })

  it('does NOT create a serverless function', async () => {
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/functions'))).toBe(false)
  })
})

// ─── SSG mode ────────────────────────────────────────────────────────────────

describe('runVercelAdapter — SSG mode', () => {
  let root: string

  beforeEach(() => {
    root = createTempRoot()
    // SSG: server bundle exists but ssg-manifest.json is present → static mode
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

  it('copies pre-rendered HTML to static/', async () => {
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/static/index.html'))).toBe(true)
    expect(existsSync(join(root, '.vercel/output/static/about/index.html'))).toBe(true)
  })

  it('copies client assets to static/assets/', async () => {
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/static/assets/main-abc.js'))).toBe(true)
  })

  it('does NOT copy ssg-manifest.json', async () => {
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/static/ssg-manifest.json'))).toBe(false)
  })

  it('does NOT create a serverless function', async () => {
    await runVercelAdapter(root)
    expect(existsSync(join(root, '.vercel/output/functions'))).toBe(false)
  })
})
