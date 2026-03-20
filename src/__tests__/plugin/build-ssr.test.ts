import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'pathe'

// We test the server entry code generation by importing just that function.
// The `buildSSR` function itself invokes Vite's `build` API which we don't
// need to exercise in unit tests (it's an integration concern).
vi.mock('vite', () => ({ build: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../plugin/generated-dir.js', () => ({
  writeGeneratedDir: vi.fn(),
  getGeneratedDir: vi.fn().mockReturnValue('/project/.cer'),
  GENERATED_DIR_NAME: '.cer',
}))
// Partial mock: keep the real readFileSync/existsSync but allow overrides in
// individual describe blocks if needed.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: vi.fn().mockReturnValue(true), renameSync: vi.fn() }
})

import type { ResolvedCerConfig } from '../../plugin/dev-server.js'

// Build a minimal ResolvedCerConfig so we can call generateServerEntryCode
// without spinning up a real Vite build.
function makeConfig(overrides: Partial<ResolvedCerConfig> = {}): ResolvedCerConfig {
  return {
    root: '/project',
    srcDir: '/project/app',
    mode: 'ssr',
    ssr: { dsd: true },
    ssg: { paths: [], concurrency: 4 },
    ...overrides,
  } as unknown as ResolvedCerConfig
}

describe('build-ssr generateServerEntryCode (template content)', () => {
  // Read the source of build-ssr.ts to assert it contains the expected
  // generated code strings.  This is intentionally coarse-grained:
  // we check that the template emits the right imports, exports, and
  // structural elements rather than testing every character.
  const src = readFileSync(
    resolve(import.meta.dirname, '../../plugin/build-ssr.ts'),
    'utf-8',
  )

  it('template imports registerBuiltinComponents from custom-elements-runtime', () => {
    expect(src).toContain('registerBuiltinComponents')
  })

  it('template imports renderToStringWithJITCSS from ssr subpath', () => {
    expect(src).toContain('renderToStringWithJITCSS')
    expect(src).toContain('custom-elements-runtime/ssr')
  })

  it('template imports initRouter from router subpath', () => {
    expect(src).toContain('initRouter')
    expect(src).toContain('custom-elements-runtime/router')
  })

  it('template loads client index.html for merging', () => {
    expect(src).toContain('_clientTemplate')
    expect(src).toContain('../client/index.html')
  })

  it('template defines _mergeWithClientTemplate helper', () => {
    expect(src).toContain('_mergeWithClientTemplate')
  })

  it('template defines _prepareRequest async function', () => {
    expect(src).toContain('_prepareRequest')
  })

  it('template exports handler as both named and default export', () => {
    expect(src).toContain('export const handler')
    expect(src).toContain('export default handler')
  })

  it('template exports apiRoutes, plugins, and layouts', () => {
    expect(src).toContain('export { apiRoutes, plugins, layouts }')
  })

  it('template sets globalThis.__CER_DATA__ synchronously before render', () => {
    expect(src).toContain('globalThis).__CER_DATA__ = loaderData')
  })

  it('template deletes __CER_DATA__ after render', () => {
    expect(src).toContain('delete (globalThis).__CER_DATA__')
  })

  it('template uses renderToStringWithJITCSSDSD (dsd always on)', () => {
    expect(src).toContain('renderToStringWithJITCSSDSD')
  })

  it('template passes dsdPolyfill: false to suppress inline polyfill', () => {
    expect(src).toContain('dsdPolyfill: false')
  })

  it('template calls registerEntityMap with entities.json', () => {
    expect(src).toContain('registerEntityMap(entitiesJson)')
    expect(src).toContain('entities.json')
  })

  it('template imports DSD_POLYFILL_SCRIPT and injects before </body>', () => {
    expect(src).toContain('DSD_POLYFILL_SCRIPT')
    expect(src).toContain("finalHtml.replace('</body>'")
  })

  it('template merges SSR html with client template when available', () => {
    expect(src).toContain('_clientTemplate')
    expect(src).toContain('_mergeWithClientTemplate(ssrHtml, _clientTemplate)')
  })

  it('template reads virtual:cer-routes', () => {
    expect(src).toContain('virtual:cer-routes')
  })

  it('template reads virtual:cer-layouts', () => {
    expect(src).toContain('virtual:cer-layouts')
  })

  it('template reads virtual:cer-plugins', () => {
    expect(src).toContain('virtual:cer-plugins')
  })

  it('template reads virtual:cer-server-api', () => {
    expect(src).toContain('virtual:cer-server-api')
  })

  it('template reads virtual:cer-components', () => {
    expect(src).toContain('virtual:cer-components')
  })

  it('sets Content-Type header on response', () => {
    expect(src).toContain('text/html; charset=utf-8')
  })

  it('template initializes plugins and sets globalThis.__cerPluginProvides', () => {
    expect(src).toContain('__cerPluginProvides')
    expect(src).toContain('_pluginProvides')
    expect(src).toContain('_pluginsReady')
  })

  it('template awaits _pluginsReady before handling each request', () => {
    expect(src).toContain('await _pluginsReady')
  })
})

describe('buildSSR', () => {
  let buildMock: ReturnType<typeof vi.fn>
  let buildSSR: (config: ResolvedCerConfig, userConfig?: Record<string, unknown>) => Promise<void>

  beforeEach(async () => {
    const { build } = await import('vite')
    buildMock = vi.mocked(build)
    buildMock.mockClear()
    buildMock.mockResolvedValue(undefined as never)
    ;({ buildSSR } = await import('../../plugin/build-ssr.js'))
  })

  it('calls vite build twice (client then server)', async () => {
    await buildSSR(makeConfig())
    expect(buildMock).toHaveBeenCalledTimes(2)
  })

  it('first build targets dist/client output dir', async () => {
    await buildSSR(makeConfig())
    const firstCall = buildMock.mock.calls[0][0] as Record<string, unknown>
    expect((firstCall.build as Record<string, unknown>).outDir).toContain('dist/client')
  })

  it('second build targets dist/server output dir', async () => {
    await buildSSR(makeConfig())
    const secondCall = buildMock.mock.calls[1][0] as Record<string, unknown>
    expect((secondCall.build as Record<string, unknown>).outDir).toContain('dist/server')
  })

  it('second build has ssr:true', async () => {
    await buildSSR(makeConfig())
    const secondCall = buildMock.mock.calls[1][0] as Record<string, unknown>
    expect((secondCall.build as Record<string, unknown>).ssr).toBe(true)
  })

  it('server bundle entry file is named server.js', async () => {
    await buildSSR(makeConfig())
    const secondCall = buildMock.mock.calls[1][0] as Record<string, unknown>
    const rollup = (secondCall.build as Record<string, unknown>).rollupOptions as Record<string, unknown>
    expect((rollup.output as Record<string, unknown>).entryFileNames).toBe('server.js')
  })

  it('merges user viteUserConfig into client build', async () => {
    await buildSSR(makeConfig(), { define: { MY_FLAG: 'true' } })
    const firstCall = buildMock.mock.calls[0][0] as Record<string, unknown>
    expect(firstCall.define).toEqual({ MY_FLAG: 'true' })
  })
})

// ─── resolveClientEntry fallback paths ───────────────────────────────────────

describe('buildSSR — resolveClientEntry fallbacks', () => {
  let buildMock: ReturnType<typeof vi.fn>
  let existsSyncMock: ReturnType<typeof vi.fn>
  let buildSSR: (config: ResolvedCerConfig) => Promise<void>

  beforeEach(async () => {
    const { build } = await import('vite')
    buildMock = vi.mocked(build)
    buildMock.mockClear()
    buildMock.mockResolvedValue(undefined as never)

    const { existsSync } = await import('node:fs')
    existsSyncMock = vi.mocked(existsSync)
    ;({ buildSSR } = await import('../../plugin/build-ssr.js'))
  })

  afterEach(() => {
    existsSyncMock.mockReturnValue(true) // restore default
  })

  it('uses index.html when it exists', async () => {
    existsSyncMock.mockImplementation((p: unknown) => String(p).endsWith('index.html'))
    await buildSSR(makeConfig())
    const clientInput = (buildMock.mock.calls[0][0] as Record<string, unknown>)
    expect(((clientInput.build as Record<string, unknown>).rollupOptions as Record<string, unknown>).input).toMatch(/(?<!\.cer\/)index\.html$/)
  })

  it('falls back to .cer/index.html when root index.html is absent', async () => {
    existsSyncMock.mockImplementation((p: unknown) =>
      String(p).endsWith('.cer/index.html'),
    )
    await buildSSR(makeConfig())
    const clientInput = (buildMock.mock.calls[0][0] as Record<string, unknown>)
    expect(((clientInput.build as Record<string, unknown>).rollupOptions as Record<string, unknown>).input).toMatch(/\.cer\/index\.html$/)
  })

  it('falls back to entry-client.ts when no index.html exists', async () => {
    existsSyncMock.mockImplementation((p: unknown) => String(p).endsWith('entry-client.ts'))
    await buildSSR(makeConfig())
    const clientInput = (buildMock.mock.calls[0][0] as Record<string, unknown>)
    expect(((clientInput.build as Record<string, unknown>).rollupOptions as Record<string, unknown>).input).toMatch(/entry-client\.ts$/)
  })

  it('falls back to app.ts when nothing else exists', async () => {
    existsSyncMock.mockReturnValue(false)
    await buildSSR(makeConfig())
    const clientInput = (buildMock.mock.calls[0][0] as Record<string, unknown>)
    expect(((clientInput.build as Record<string, unknown>).rollupOptions as Record<string, unknown>).input).toMatch(/app\.ts$/)
  })
})

// ─── Server build virtual plugin callbacks ────────────────────────────────────

describe('buildSSR — virtual server-entry plugin', () => {
  let buildMock: ReturnType<typeof vi.fn>
  let buildSSR: (config: ResolvedCerConfig) => Promise<void>

  beforeEach(async () => {
    const { build } = await import('vite')
    buildMock = vi.mocked(build)
    buildMock.mockClear()
    buildMock.mockResolvedValue(undefined as never)
    ;({ buildSSR } = await import('../../plugin/build-ssr.js'))
  })

  async function getServerPlugin() {
    await buildSSR(makeConfig())
    const serverCallPlugins: any[] = (buildMock.mock.calls[1][0] as any).plugins ?? []
    return serverCallPlugins.find((p: any) => p?.name === 'vite-plugin-cer-server-entry')
  }

  it('server build includes vite-plugin-cer-server-entry plugin', async () => {
    const plugin = await getServerPlugin()
    expect(plugin).toBeDefined()
  })

  it('resolveId returns resolved id for virtual:cer-server-entry', async () => {
    const plugin = await getServerPlugin()
    expect(plugin.resolveId('virtual:cer-server-entry')).toBe('\0virtual:cer-server-entry')
  })

  it('resolveId returns undefined for unknown ids', async () => {
    const plugin = await getServerPlugin()
    expect(plugin.resolveId('some-other-id')).toBeUndefined()
  })

  it('load returns server entry source for resolved id', async () => {
    const plugin = await getServerPlugin()
    const source = plugin.load('\0virtual:cer-server-entry')
    expect(typeof source).toBe('string')
    expect(source).toContain('AUTO-GENERATED server entry')
  })

  it('load returns undefined for other ids', async () => {
    const plugin = await getServerPlugin()
    expect(plugin.load('something-else')).toBeUndefined()
  })
})
