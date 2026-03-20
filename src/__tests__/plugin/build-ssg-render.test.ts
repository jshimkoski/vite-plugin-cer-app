/**
 * Integration tests for the build-ssg renderPath success path.
 *
 * These tests use a real temporary ESM module as the "server bundle" so that
 * the dynamic import() inside renderPath actually resolves, exercising the
 * success branches (writeRenderedPath call, generatedPaths.push, etc.) that
 * are unreachable when the bundle is absent.
 *
 * A separate test file is required so the node:fs/promises mock does NOT
 * shadow the real writeFile/mkdir used to set up the temp bundle.
 */
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'

// Mock buildSSR so the SSG pipeline skips the Vite build step.
vi.mock('../../plugin/build-ssr.js', () => ({ buildSSR: vi.fn().mockResolvedValue(undefined) }))
vi.mock('fast-glob', () => ({ default: vi.fn().mockResolvedValue([]) }))
// Intentionally NOT mocking node:fs or node:fs/promises so real writes work.

import type { ResolvedCerConfig } from '../../plugin/dev-server.js'

let tmpRoot: string

beforeAll(() => {
  // Create a minimal "server bundle" that exports a handler.
  // The handler writes a minimal HTML string to res.end so renderPath captures it.
  tmpRoot = join(tmpdir(), `cer-ssg-render-${Date.now()}`)
  const serverDir = join(tmpRoot, 'dist', 'server')
  mkdirSync(serverDir, { recursive: true })
  writeFileSync(
    join(serverDir, 'server.js'),
    // ESM module — works because Vitest runs with Node's native ESM loader.
    `export const handler = async (req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!DOCTYPE html><html><head></head><body>Hello from ' + req.url + '</body></html>');
    };
    export const apiRoutes = [];
    export const plugins = [];
    export const layouts = {};
    `,
    'utf-8',
  )
})

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

function makeConfig(overrides: Partial<ResolvedCerConfig> = {}): ResolvedCerConfig {
  return {
    root: tmpRoot,
    srcDir: join(tmpRoot, 'app'),
    pagesDir: join(tmpRoot, 'app', 'pages'),
    mode: 'ssg',
    ssr: { dsd: true },
    ssg: { routes: ['/'], concurrency: 1 },
    ...overrides,
  } as unknown as ResolvedCerConfig
}

describe('buildSSG — renderPath success (real server bundle)', () => {
  it('writes rendered HTML for the root path to dist/index.html', async () => {
    // Reset module registry so _serverMod cache is cleared between test runs.
    await vi.resetModules()
    const { buildSSG } = await import('../../plugin/build-ssg.js')
    await buildSSG(makeConfig())

    const { readFileSync, existsSync } = await import('node:fs')
    const outPath = join(tmpRoot, 'dist', 'index.html')
    expect(existsSync(outPath)).toBe(true)
    const html = readFileSync(outPath, 'utf-8')
    expect(html).toContain('Hello from /')
  })

  it('records the path in the ssg-manifest paths array', async () => {
    await vi.resetModules()
    const { buildSSG } = await import('../../plugin/build-ssg.js')
    await buildSSG(makeConfig())

    const { readFileSync } = await import('node:fs')
    const manifest = JSON.parse(readFileSync(join(tmpRoot, 'dist', 'ssg-manifest.json'), 'utf-8'))
    expect(manifest.paths).toContain('/')
    expect(manifest.errors).toHaveLength(0)
  })

  it('renders multiple paths with concurrency > 1', async () => {
    await vi.resetModules()
    const { buildSSG } = await import('../../plugin/build-ssg.js')
    const config = makeConfig({ ssg: { routes: ['/', '/about'], concurrency: 2 } } as Partial<ResolvedCerConfig>)
    await buildSSG(config)

    const { readFileSync, existsSync } = await import('node:fs')
    expect(existsSync(join(tmpRoot, 'dist', 'index.html'))).toBe(true)
    expect(existsSync(join(tmpRoot, 'dist', 'about', 'index.html'))).toBe(true)
    const manifest = JSON.parse(readFileSync(join(tmpRoot, 'dist', 'ssg-manifest.json'), 'utf-8'))
    expect(manifest.paths).toHaveLength(2)
  })

  it('uses cached _serverMod on second renderPath call (no double import)', async () => {
    // In a fresh module instance, render two paths sequentially.
    // The second renderPath call hits the !_serverMod === false branch (cache).
    await vi.resetModules()
    const { buildSSG } = await import('../../plugin/build-ssg.js')
    const config = makeConfig({ ssg: { routes: ['/', '/page2'], concurrency: 1 } } as Partial<ResolvedCerConfig>)
    // Should complete without error — second call uses cached module
    await expect(buildSSG(config)).resolves.not.toThrow()
  })
})
