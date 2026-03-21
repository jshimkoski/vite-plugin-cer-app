import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({ existsSync: vi.fn().mockReturnValue(false) }))
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
}))
vi.mock('fast-glob', () => ({ default: vi.fn().mockResolvedValue([]) }))
vi.mock('vite', () => ({
  build: vi.fn().mockResolvedValue(undefined),
  createServer: vi.fn(),
}))
vi.mock('../../plugin/build-ssr.js', () => ({ buildSSR: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../plugin/path-utils.js', () => ({ buildRouteEntry: vi.fn() }))

import { existsSync } from 'node:fs'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import fg from 'fast-glob'
import { createServer } from 'vite'
import { buildSSR } from '../../plugin/build-ssr.js'
import { buildRouteEntry } from '../../plugin/path-utils.js'
import { buildSSG, writeRenderedPath } from '../../plugin/build-ssg.js'
import type { ResolvedCerConfig } from '../../plugin/dev-server.js'

function makeConfig(overrides: Partial<ResolvedCerConfig> = {}): ResolvedCerConfig {
  return {
    root: '/project',
    srcDir: '/project/app',
    pagesDir: '/project/app/pages',
    mode: 'ssg',
    ssg: { concurrency: 4 },
    ...overrides,
  } as unknown as ResolvedCerConfig
}

beforeEach(() => {
  vi.mocked(buildSSR).mockClear()
  vi.mocked(writeFile).mockClear()
  vi.mocked(mkdir).mockClear()
  vi.mocked(fg).mockClear()
  vi.mocked(readFile).mockClear()
  vi.mocked(existsSync).mockReturnValue(false)
  vi.mocked(fg).mockResolvedValue([])
  vi.mocked(readFile).mockResolvedValue('')
  vi.mocked(buildRouteEntry).mockReset()
})

describe('buildSSG — buildSSR delegation', () => {
  it('calls buildSSR as step 1', async () => {
    await buildSSG(makeConfig())
    expect(buildSSR).toHaveBeenCalledTimes(1)
  })

  it('passes the config to buildSSR', async () => {
    const config = makeConfig()
    await buildSSG(config)
    expect(vi.mocked(buildSSR).mock.calls[0][0]).toBe(config)
  })
})

describe('buildSSG — ssg-manifest.json', () => {
  it('writes ssg-manifest.json to the dist directory', async () => {
    await buildSSG(makeConfig())
    const manifestCall = vi.mocked(writeFile).mock.calls.find(([path]) =>
      String(path).includes('ssg-manifest.json'),
    )
    expect(manifestCall).toBeDefined()
    expect(String(manifestCall![0])).toContain('/project/dist/ssg-manifest.json')
  })

  it('manifest JSON contains generatedAt field', async () => {
    await buildSSG(makeConfig())
    const manifestCall = vi.mocked(writeFile).mock.calls.find(([p]) =>
      String(p).includes('ssg-manifest.json'),
    )
    const manifest = JSON.parse(String(manifestCall![1]))
    expect(manifest).toHaveProperty('generatedAt')
    expect(typeof manifest.generatedAt).toBe('string')
  })

  it('manifest JSON contains paths array', async () => {
    await buildSSG(makeConfig())
    const manifestCall = vi.mocked(writeFile).mock.calls.find(([p]) =>
      String(p).includes('ssg-manifest.json'),
    )
    const manifest = JSON.parse(String(manifestCall![1]))
    expect(manifest).toHaveProperty('paths')
    expect(Array.isArray(manifest.paths)).toBe(true)
  })

  it('manifest JSON contains errors array', async () => {
    await buildSSG(makeConfig())
    const manifestCall = vi.mocked(writeFile).mock.calls.find(([p]) =>
      String(p).includes('ssg-manifest.json'),
    )
    const manifest = JSON.parse(String(manifestCall![1]))
    expect(manifest).toHaveProperty('errors')
    expect(Array.isArray(manifest.errors)).toBe(true)
  })

  it('records render errors in manifest (missing server bundle)', async () => {
    const config = makeConfig({ ssg: { routes: ['/about'], concurrency: 1 } } as Partial<ResolvedCerConfig>)
    await buildSSG(config)
    const manifestCall = vi.mocked(writeFile).mock.calls.find(([p]) =>
      String(p).includes('ssg-manifest.json'),
    )
    const manifest = JSON.parse(String(manifestCall![1]))
    // paths + errors together must cover every route we attempted to render
    expect(manifest.paths.length + manifest.errors.length).toBe(1)
  })

  it('error entries have path and error fields', async () => {
    const config = makeConfig({ ssg: { routes: ['/fail'], concurrency: 1 } } as Partial<ResolvedCerConfig>)
    await buildSSG(config)
    const manifestCall = vi.mocked(writeFile).mock.calls.find(([p]) =>
      String(p).includes('ssg-manifest.json'),
    )
    const manifest = JSON.parse(String(manifestCall![1]))
    if (manifest.errors.length > 0) {
      expect(manifest.errors[0]).toHaveProperty('path')
      expect(manifest.errors[0]).toHaveProperty('error')
    }
  })
})

describe('buildSSG — path collection', () => {
  it('uses ssg.routes when explicitly provided (skips auto-discovery)', async () => {
    const config = makeConfig({
      ssg: { routes: ['/a', '/b'], concurrency: 1 },
    } as Partial<ResolvedCerConfig>)
    await buildSSG(config)
    // fast-glob should NOT have been called — routes are explicit
    expect(fg).not.toHaveBeenCalled()
  })

  it('calls fg when pagesDir exists and no explicit routes', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    await buildSSG(makeConfig())
    expect(fg).toHaveBeenCalledTimes(1)
  })

  it('skips Vite dev server when all discovered pages are static', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fg).mockResolvedValue([
      '/project/app/pages/index.ts',
      '/project/app/pages/about.ts',
    ])
    vi.mocked(buildRouteEntry)
      .mockReturnValueOnce({ routePath: '/', isDynamic: false, isCatchAll: false } as ReturnType<typeof buildRouteEntry>)
      .mockReturnValueOnce({ routePath: '/about', isDynamic: false, isCatchAll: false } as ReturnType<typeof buildRouteEntry>)

    await buildSSG(makeConfig())

    expect(createServer).not.toHaveBeenCalled()
  })

  it('spawns Vite dev server for dynamic pages', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fg).mockResolvedValue(['/project/app/pages/[slug].ts'])
    vi.mocked(buildRouteEntry).mockReturnValueOnce({
      routePath: '/:slug',
      isDynamic: true,
      isCatchAll: false,
    } as ReturnType<typeof buildRouteEntry>)

    const closeFn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createServer).mockResolvedValue({
      ssrLoadModule: vi.fn().mockResolvedValue({}),
      close: closeFn,
    } as unknown as Awaited<ReturnType<typeof createServer>>)

    await buildSSG(makeConfig())

    expect(createServer).toHaveBeenCalledTimes(1)
    expect(closeFn).toHaveBeenCalledTimes(1)
  })

  it('closes Vite dev server even when ssrLoadModule throws', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fg).mockResolvedValue(['/project/app/pages/[slug].ts'])
    vi.mocked(buildRouteEntry).mockReturnValueOnce({
      routePath: '/:slug',
      isDynamic: true,
      isCatchAll: false,
    } as ReturnType<typeof buildRouteEntry>)

    const closeFn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createServer).mockResolvedValue({
      ssrLoadModule: vi.fn().mockRejectedValue(new Error('load failed')),
      close: closeFn,
    } as unknown as Awaited<ReturnType<typeof createServer>>)

    await buildSSG(makeConfig())

    expect(closeFn).toHaveBeenCalledTimes(1)
  })

  it('expands dynamic ssg.paths into concrete URL paths', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fg).mockResolvedValue(['/project/app/pages/[id].ts'])
    vi.mocked(buildRouteEntry).mockReturnValueOnce({
      routePath: '/:id',
      isDynamic: true,
      isCatchAll: false,
    } as ReturnType<typeof buildRouteEntry>)

    const ssgPathsFn = vi.fn().mockResolvedValue([
      { params: { id: '1' } },
      { params: { id: '2' } },
    ])
    const closeFn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createServer).mockResolvedValue({
      ssrLoadModule: vi.fn().mockResolvedValue({ meta: { ssg: { paths: ssgPathsFn } } }),
      close: closeFn,
    } as unknown as Awaited<ReturnType<typeof createServer>>)

    const config = makeConfig({ ssg: { concurrency: 1 } } as Partial<ResolvedCerConfig>)
    await buildSSG(config)

    // The manifest should attempt to render '/', '/1', '/2' (3 paths total)
    const manifestCall = vi.mocked(writeFile).mock.calls.find(([p]) =>
      String(p).includes('ssg-manifest.json'),
    )
    const manifest = JSON.parse(String(manifestCall![1]))
    expect(manifest.paths.length + manifest.errors.length).toBe(3)
  })

  it('skips catch-all pages when auto-discovering paths', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fg).mockResolvedValue(['/project/app/pages/[...all].ts'])
    vi.mocked(buildRouteEntry).mockReturnValueOnce({
      routePath: '/:all*',
      isDynamic: true,
      isCatchAll: true,
    } as ReturnType<typeof buildRouteEntry>)

    await buildSSG(makeConfig())

    // Only '/' (always added) should be attempted
    const manifestCall = vi.mocked(writeFile).mock.calls.find(([p]) =>
      String(p).includes('ssg-manifest.json'),
    )
    const manifest = JSON.parse(String(manifestCall![1]))
    expect(manifest.paths.length + manifest.errors.length).toBe(1)
  })

  it('deduplicates collected paths', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fg).mockResolvedValue([
      '/project/app/pages/index.ts',
      '/project/app/pages/home.ts',
    ])
    // Both resolve to '/' — should deduplicate to a single path
    vi.mocked(buildRouteEntry)
      .mockReturnValueOnce({ routePath: '/', isDynamic: false, isCatchAll: false } as ReturnType<typeof buildRouteEntry>)
      .mockReturnValueOnce({ routePath: '/', isDynamic: false, isCatchAll: false } as ReturnType<typeof buildRouteEntry>)

    await buildSSG(makeConfig({ ssg: { concurrency: 1 } } as Partial<ResolvedCerConfig>))

    const manifestCall = vi.mocked(writeFile).mock.calls.find(([p]) =>
      String(p).includes('ssg-manifest.json'),
    )
    const manifest = JSON.parse(String(manifestCall![1]))
    expect(manifest.paths.length + manifest.errors.length).toBe(1)
  })
})

// ─── render: 'server' / 'spa' skip ───────────────────────────────────────────

describe('buildSSG — render strategy skip (static pages)', () => {
  it('skips static page with render: server', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fg).mockResolvedValue(['/project/app/pages/dashboard.ts'])
    vi.mocked(readFile).mockResolvedValue("export const meta = { render: 'server' }")
    vi.mocked(buildRouteEntry).mockReturnValueOnce({
      routePath: '/dashboard',
      isDynamic: false,
      isCatchAll: false,
    } as ReturnType<typeof buildRouteEntry>)

    const config = makeConfig({ ssg: { concurrency: 1 } } as Partial<ResolvedCerConfig>)
    await buildSSG(config)

    // buildRouteEntry should never be called — page is skipped before it
    expect(buildRouteEntry).not.toHaveBeenCalled()
  })

  it('skips static page with render: spa', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fg).mockResolvedValue(['/project/app/pages/profile.ts'])
    vi.mocked(readFile).mockResolvedValue("export const meta = { render: 'spa' }")
    vi.mocked(buildRouteEntry).mockReturnValueOnce({
      routePath: '/profile',
      isDynamic: false,
      isCatchAll: false,
    } as ReturnType<typeof buildRouteEntry>)

    const config = makeConfig({ ssg: { concurrency: 1 } } as Partial<ResolvedCerConfig>)
    await buildSSG(config)

    expect(buildRouteEntry).not.toHaveBeenCalled()
  })

  it('does not skip static page with render: static', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fg).mockResolvedValue(['/project/app/pages/legal.ts'])
    vi.mocked(readFile).mockResolvedValue("export const meta = { render: 'static' }")
    vi.mocked(buildRouteEntry).mockReturnValueOnce({
      routePath: '/legal',
      isDynamic: false,
      isCatchAll: false,
    } as ReturnType<typeof buildRouteEntry>)

    await buildSSG(makeConfig())

    expect(buildRouteEntry).toHaveBeenCalledTimes(1)
  })

  it('does not skip static page with no render meta', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fg).mockResolvedValue(['/project/app/pages/about.ts'])
    vi.mocked(readFile).mockResolvedValue("component('page-about', () => html`<h1>About</h1>`)")
    vi.mocked(buildRouteEntry).mockReturnValueOnce({
      routePath: '/about',
      isDynamic: false,
      isCatchAll: false,
    } as ReturnType<typeof buildRouteEntry>)

    await buildSSG(makeConfig())

    expect(buildRouteEntry).toHaveBeenCalledTimes(1)
  })
})

describe('buildSSG — render strategy skip (dynamic pages)', () => {
  it('skips dynamic page with render: server from ssrLoadModule', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fg).mockResolvedValue(['/project/app/pages/[slug].ts'])
    vi.mocked(readFile).mockResolvedValue('')
    vi.mocked(buildRouteEntry).mockReturnValueOnce({
      routePath: '/:slug',
      isDynamic: true,
      isCatchAll: false,
    } as ReturnType<typeof buildRouteEntry>)

    const closeFn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createServer).mockResolvedValue({
      ssrLoadModule: vi.fn().mockResolvedValue({ meta: { render: 'server' } }),
      close: closeFn,
    } as unknown as Awaited<ReturnType<typeof createServer>>)

    const config = makeConfig({ ssg: { concurrency: 1 } } as Partial<ResolvedCerConfig>)
    await buildSSG(config)

    // Only '/' (always added) — the dynamic route was skipped
    const manifestCall = vi.mocked(writeFile).mock.calls.find(([p]) =>
      String(p).includes('ssg-manifest.json'),
    )
    const manifest = JSON.parse(String(manifestCall![1]))
    expect(manifest.paths.length + manifest.errors.length).toBe(1)
  })

  it('skips dynamic page with render: spa from ssrLoadModule', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fg).mockResolvedValue(['/project/app/pages/[id].ts'])
    vi.mocked(readFile).mockResolvedValue('')
    vi.mocked(buildRouteEntry).mockReturnValueOnce({
      routePath: '/:id',
      isDynamic: true,
      isCatchAll: false,
    } as ReturnType<typeof buildRouteEntry>)

    const closeFn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(createServer).mockResolvedValue({
      ssrLoadModule: vi.fn().mockResolvedValue({ meta: { render: 'spa' } }),
      close: closeFn,
    } as unknown as Awaited<ReturnType<typeof createServer>>)

    const config = makeConfig({ ssg: { concurrency: 1 } } as Partial<ResolvedCerConfig>)
    await buildSSG(config)

    const manifestCall = vi.mocked(writeFile).mock.calls.find(([p]) =>
      String(p).includes('ssg-manifest.json'),
    )
    const manifest = JSON.parse(String(manifestCall![1]))
    expect(manifest.paths.length + manifest.errors.length).toBe(1)
  })
})

// ─── writeRenderedPath ────────────────────────────────────────────────────────

describe('writeRenderedPath', () => {
  beforeEach(() => {
    vi.mocked(writeFile).mockClear()
    vi.mocked(mkdir).mockClear()
  })

  it('writes root path to dist/index.html', async () => {
    await writeRenderedPath('/', '<html>home</html>', '/project/dist')
    const [writePath] = vi.mocked(writeFile).mock.calls[0]
    expect(String(writePath)).toMatch(/dist\/index\.html$/)
  })

  it('writes /about to dist/about/index.html', async () => {
    await writeRenderedPath('/about', '<html>about</html>', '/project/dist')
    const [writePath] = vi.mocked(writeFile).mock.calls[0]
    expect(String(writePath)).toMatch(/dist\/about\/index\.html$/)
  })

  it('writes nested path to correct subdirectory', async () => {
    await writeRenderedPath('/blog/first-post', '<html>post</html>', '/project/dist')
    const [writePath] = vi.mocked(writeFile).mock.calls[0]
    expect(String(writePath)).toMatch(/dist\/blog\/first-post\/index\.html$/)
  })

  it('writes the provided html content', async () => {
    const html = '<html><body>Hello</body></html>'
    await writeRenderedPath('/page', html, '/project/dist')
    const [, content] = vi.mocked(writeFile).mock.calls[0]
    expect(content).toBe(html)
  })

  it('creates the output directory before writing', async () => {
    await writeRenderedPath('/nested/deep', '<html/>', '/project/dist')
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('nested/deep'), { recursive: true })
  })

  it('strips leading and trailing slashes from path', async () => {
    await writeRenderedPath('/trailing/', '<html/>', '/project/dist')
    const [writePath] = vi.mocked(writeFile).mock.calls[0]
    expect(String(writePath)).toMatch(/trailing\/index\.html$/)
    expect(String(writePath)).not.toMatch(/\/\//)
  })
})
