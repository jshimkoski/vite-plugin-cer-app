import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// We test the SSR build pipeline by exercising buildSSR and its helpers.
// Template content is tested in entry-server-template.test.ts.
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

function makeConfig(overrides: Partial<ResolvedCerConfig> = {}): ResolvedCerConfig {
  return {
    root: '/project',
    srcDir: '/project/app',
    mode: 'ssr',
    ssg: { paths: [], concurrency: 4 },
    ...overrides,
  } as unknown as ResolvedCerConfig
}

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

  it('server build keeps @jasonshimmy/vite-plugin-cer-app in ssr.noExternal', async () => {
    await buildSSR(makeConfig())
    const secondCall = buildMock.mock.calls[1][0] as Record<string, unknown>
    const noExternal = (secondCall.ssr as Record<string, unknown>).noExternal as string[]
    expect(noExternal).toContain('@jasonshimmy/vite-plugin-cer-app')
  })

  it('server build does NOT bundle @jasonshimmy/custom-elements-runtime so third-party component libraries share the same registry', async () => {
    await buildSSR(makeConfig())
    const secondCall = buildMock.mock.calls[1][0] as Record<string, unknown>
    const noExternal = (secondCall.ssr as Record<string, unknown>).noExternal as string[]
    expect(noExternal).not.toContain('@jasonshimmy/custom-elements-runtime')
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
    expect(source).toContain('AUTO-GENERATED by @jasonshimmy/vite-plugin-cer-app')
  })

  it('load returns undefined for other ids', async () => {
    const plugin = await getServerPlugin()
    expect(plugin.load('something-else')).toBeUndefined()
  })
})
