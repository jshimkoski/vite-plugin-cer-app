import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@jasonshimmy/custom-elements-runtime/vite-plugin', () => ({
  cerPlugin: vi.fn().mockReturnValue([{ name: 'cer-runtime-plugin' }]),
}))
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, existsSync: vi.fn().mockReturnValue(true), readFileSync: vi.fn().mockReturnValue('') }
})
vi.mock('../../plugin/dev-server.js', () => ({
  configureCerDevServer: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../plugin/scanner.js', () => ({
  createWatcher: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
  scanDirectory: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../plugin/dts-generator.js', () => ({
  scanComposableExports: vi.fn().mockResolvedValue(new Map()),
  writeAutoImportDts: vi.fn().mockResolvedValue(undefined),
  writeTsconfigPaths: vi.fn(),
}))
vi.mock('../../plugin/generated-dir.js', () => ({
  writeGeneratedDir: vi.fn(),
  getGeneratedDir: vi.fn().mockReturnValue('/project/.cer'),
  GENERATED_DIR_NAME: '.cer',
}))
vi.mock('../../plugin/virtual/routes.js', () => ({ generateRoutesCode: vi.fn().mockResolvedValue('// routes') }))
vi.mock('../../plugin/virtual/layouts.js', () => ({ generateLayoutsCode: vi.fn().mockResolvedValue('// layouts') }))
vi.mock('../../plugin/virtual/components.js', () => ({ generateComponentsCode: vi.fn().mockResolvedValue('// components') }))
vi.mock('../../plugin/virtual/composables.js', () => ({ generateComposablesCode: vi.fn().mockResolvedValue('// composables') }))
vi.mock('../../plugin/virtual/plugins.js', () => ({ generatePluginsCode: vi.fn().mockResolvedValue('// plugins') }))
vi.mock('../../plugin/virtual/middleware.js', () => ({ generateMiddlewareCode: vi.fn().mockResolvedValue('// middleware') }))
vi.mock('../../plugin/virtual/server-api.js', () => ({ generateServerApiCode: vi.fn().mockResolvedValue('// server-api') }))
vi.mock('../../plugin/virtual/server-middleware.js', () => ({ generateServerMiddlewareCode: vi.fn().mockResolvedValue('// server-middleware') }))
vi.mock('../../plugin/virtual/loading.js', () => ({ generateLoadingCode: vi.fn().mockResolvedValue('// loading') }))
vi.mock('../../plugin/virtual/error.js', () => ({ generateErrorCode: vi.fn().mockResolvedValue('// error') }))
vi.mock('../../plugin/transforms/auto-import.js', () => ({ autoImportTransform: vi.fn().mockReturnValue(null) }))

import { cerApp } from '../../plugin/index.js'


type TestPlugin = {
  name: string
  config: (viteConfig: Record<string, unknown>, env: Record<string, unknown>) => unknown
  configResolved: (resolved: Record<string, unknown>) => void
  resolveId: (id: string) => string | undefined
  load: (id: string) => Promise<string | null>
  transform: (code: string, id: string) => unknown
  buildStart: () => Promise<void>
  configureServer: (server: unknown) => Promise<void>
}

// Helper to get the cerAppPlugin (first plugin in the returned array)
function getCerPlugin(userConfig = {}): TestPlugin {
  return cerApp(userConfig)[0] as unknown as TestPlugin
}

// Minimal resolved config that mirrors what Vite passes to configResolved
const FAKE_RESOLVED = { root: '/project' }

describe('cerApp()', () => {
  it('returns an array of plugins', () => {
    const plugins = cerApp()
    expect(Array.isArray(plugins)).toBe(true)
    expect(plugins.length).toBeGreaterThan(0)
  })

  it('first plugin is named @jasonshimmy/vite-plugin-cer-app', () => {
    const plugin = getCerPlugin()
    expect(plugin.name).toBe('@jasonshimmy/vite-plugin-cer-app')
  })
})

describe('cerApp plugin — config hook', () => {
  it('returns build.target: esnext', () => {
    const plugin = getCerPlugin()
    const result = plugin.config({ root: '/project' }, { command: 'build', mode: 'production' }) as Record<string, unknown>
    expect((result.build as Record<string, unknown>).target).toBe('esnext')
  })

  it('config hook resolves the root', () => {
    const plugin = getCerPlugin()
    const result = plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    expect(result).toBeDefined()
  })
})

describe('cerApp plugin — configResolved hook', () => {
  it('does not throw when called', () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    expect(() => plugin.configResolved(FAKE_RESOLVED)).not.toThrow()
  })
})

describe('cerApp plugin — resolveId hook', () => {
  beforeEach(() => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
  })

  it('resolves virtual:cer-routes to \\0virtual:cer-routes', () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    expect(plugin.resolveId('virtual:cer-routes')).toBe('\0virtual:cer-routes')
  })

  it('resolves virtual:cer-layouts', () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    expect(plugin.resolveId('virtual:cer-layouts')).toBe('\0virtual:cer-layouts')
  })

  it('resolves virtual:cer-components', () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    expect(plugin.resolveId('virtual:cer-components')).toBe('\0virtual:cer-components')
  })

  it('resolves virtual:cer-plugins', () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    expect(plugin.resolveId('virtual:cer-plugins')).toBe('\0virtual:cer-plugins')
  })

  it('resolves virtual:cer-server-api', () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    expect(plugin.resolveId('virtual:cer-server-api')).toBe('\0virtual:cer-server-api')
  })

  it('resolves virtual:cer-loading', () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    expect(plugin.resolveId('virtual:cer-loading')).toBe('\0virtual:cer-loading')
  })

  it('resolves virtual:cer-error', () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    expect(plugin.resolveId('virtual:cer-error')).toBe('\0virtual:cer-error')
  })

  it('returns undefined for unknown ids', () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    expect(plugin.resolveId('some-unknown-id')).toBeUndefined()
  })
})

describe('cerApp plugin — load hook', () => {
  it('returns null for unknown resolved ids', async () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
    const result = await plugin.load('\0unknown-module')
    expect(result).toBeNull()
  })

  it('loads virtual:cer-routes module code', async () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
    const result = await plugin.load('\0virtual:cer-routes')
    expect(result).toBe('// routes')
  })

  it('loads virtual:cer-layouts module code', async () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
    const result = await plugin.load('\0virtual:cer-layouts')
    expect(result).toBe('// layouts')
  })

  it('loads virtual:cer-components module code', async () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
    const result = await plugin.load('\0virtual:cer-components')
    expect(result).toBe('// components')
  })

  it('loads virtual:cer-loading module code', async () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
    const result = await plugin.load('\0virtual:cer-loading')
    expect(result).toBe('// loading')
  })

  it('loads virtual:cer-error module code', async () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
    const result = await plugin.load('\0virtual:cer-error')
    expect(result).toBe('// error')
  })

  it('returns cached code on repeated load calls', async () => {
    const { generateRoutesCode } = await import('../../plugin/virtual/routes.js')
    vi.mocked(generateRoutesCode).mockClear()

    // Use a SINGLE plugin instance so the module cache persists across calls
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)

    const first = await plugin.load('\0virtual:cer-routes')
    const second = await plugin.load('\0virtual:cer-routes')

    expect(first).toBe(second)
    // generateRoutesCode should only be called once (cache hit on second call)
    expect(generateRoutesCode).toHaveBeenCalledTimes(1)
  })

  it('loads virtual:cer-app-config and exports appConfig', async () => {
    const plugin = getCerPlugin({ mode: 'ssg' })
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
    const result = await plugin.load('\0virtual:cer-app-config') as string
    expect(result).toContain('appConfig')
    expect(result).toContain('ssg')
  })
})

describe('cerApp plugin — transform hook', () => {
  it('returns null for virtual module ids', async () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
    const result = plugin.transform('// code', '\0virtual:cer-routes')
    expect(result).toBeNull()
  })

  it('calls autoImportTransform for regular files', async () => {
    const { autoImportTransform } = await import('../../plugin/transforms/auto-import.js')
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)

    plugin.transform('const x = 1', '/project/app/pages/index.ts')
    expect(autoImportTransform).toHaveBeenCalled()
  })

  it('returns null when autoImportTransform returns null', async () => {
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
    const result = plugin.transform('const x = 1', '/project/app/pages/index.ts')
    expect(result).toBeNull()
  })

  it('returns { code, map } when autoImportTransform returns a string', async () => {
    const { autoImportTransform } = await import('../../plugin/transforms/auto-import.js')
    vi.mocked(autoImportTransform).mockReturnValueOnce('transformed code')
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
    const result = plugin.transform('const x = 1', '/project/app/pages/index.ts') as { code: string; map: null }
    expect(result).toEqual({ code: 'transformed code', map: null })
  })

  it('returns null when autoImports.runtime is false', async () => {
    const plugin = getCerPlugin({ autoImports: { runtime: false } })
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
    const result = plugin.transform('const x = 1', '/project/app/pages/index.ts')
    expect(result).toBeNull()
  })
})

describe('cerApp plugin — buildStart hook', () => {
  it('calls writeGeneratedDir on build start', async () => {
    const { writeGeneratedDir } = await import('../../plugin/generated-dir.js')
    vi.mocked(writeGeneratedDir).mockClear()
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'build', mode: 'production' })
    plugin.configResolved(FAKE_RESOLVED)
    await plugin.buildStart()
    expect(writeGeneratedDir).toHaveBeenCalledTimes(1)
  })

  it('calls scanComposableExports on build start', async () => {
    const { scanComposableExports } = await import('../../plugin/dts-generator.js')
    vi.mocked(scanComposableExports).mockClear()
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'build', mode: 'production' })
    plugin.configResolved(FAKE_RESOLVED)
    await plugin.buildStart()
    expect(scanComposableExports).toHaveBeenCalledTimes(1)
  })

  it('calls writeAutoImportDts on build start', async () => {
    const { writeAutoImportDts } = await import('../../plugin/dts-generator.js')
    vi.mocked(writeAutoImportDts).mockClear()
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'build', mode: 'production' })
    plugin.configResolved(FAKE_RESOLVED)
    await plugin.buildStart()
    expect(writeAutoImportDts).toHaveBeenCalledTimes(1)
  })

  it('calls writeTsconfigPaths on build start', async () => {
    const { writeTsconfigPaths } = await import('../../plugin/dts-generator.js')
    vi.mocked(writeTsconfigPaths).mockClear()
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'build', mode: 'production' })
    plugin.configResolved(FAKE_RESOLVED)
    await plugin.buildStart()
    expect(writeTsconfigPaths).toHaveBeenCalledTimes(1)
  })
})

describe('cerApp plugin — configureServer hook', () => {
  it('calls writeGeneratedDir on server configure', async () => {
    const { writeGeneratedDir } = await import('../../plugin/generated-dir.js')
    vi.mocked(writeGeneratedDir).mockClear()
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)
    const mockServer = {
      watcher: { on: vi.fn() },
      moduleGraph: { getModuleById: vi.fn().mockReturnValue(null), invalidateModule: vi.fn() },
      ws: { send: vi.fn() },
      middlewares: { use: vi.fn() },
    }
    await plugin.configureServer(mockServer)
    expect(writeGeneratedDir).toHaveBeenCalledTimes(1)
  })

  it('calls scanComposableExports on server configure', async () => {
    const { scanComposableExports } = await import('../../plugin/dts-generator.js')
    vi.mocked(scanComposableExports).mockClear()
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)

    const mockServer = {
      watcher: { on: vi.fn() },
      moduleGraph: { getModuleById: vi.fn().mockReturnValue(null), invalidateModule: vi.fn() },
      ws: { send: vi.fn() },
    }
    await plugin.configureServer(mockServer)
    expect(scanComposableExports).toHaveBeenCalled()
  })

  it('calls configureCerDevServer on server configure', async () => {
    const { configureCerDevServer } = await import('../../plugin/dev-server.js')
    vi.mocked(configureCerDevServer).mockClear()
    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)

    const mockServer = {
      watcher: { on: vi.fn() },
      moduleGraph: { getModuleById: vi.fn().mockReturnValue(null), invalidateModule: vi.fn() },
      ws: { send: vi.fn() },
    }
    await plugin.configureServer(mockServer)
    expect(configureCerDevServer).toHaveBeenCalled()
  })

  it('invokes the file-change watcher callback on add event', async () => {
    const { createWatcher } = await import('../../plugin/scanner.js')
    const { scanComposableExports } = await import('../../plugin/dts-generator.js')
    vi.mocked(scanComposableExports).mockClear()

    let capturedCallback: ((event: string, file: string) => void) | null = null
    vi.mocked(createWatcher).mockImplementationOnce((_watcher, _dirs, cb) => {
      capturedCallback = cb
      return { on: vi.fn(), close: vi.fn() } as unknown as ReturnType<typeof createWatcher>
    })

    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)

    const mockServer = {
      watcher: { on: vi.fn() },
      moduleGraph: { getModuleById: vi.fn().mockReturnValue(null), invalidateModule: vi.fn() },
      ws: { send: vi.fn() },
    }
    await plugin.configureServer(mockServer)

    // Simulate an 'add' event on a pages file — covers getDirtyVirtualIds and watcher callback
    await capturedCallback!('add', '/project/app/pages/new-page.ts')
    expect((mockServer.ws.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ type: 'full-reload' })
  })

  it('re-scans composables when a composable file is added', async () => {
    const { createWatcher } = await import('../../plugin/scanner.js')
    const { scanComposableExports } = await import('../../plugin/dts-generator.js')
    vi.mocked(scanComposableExports).mockClear()

    let capturedCallback: ((event: string, file: string) => void) | null = null
    vi.mocked(createWatcher).mockImplementationOnce((_watcher, _dirs, cb) => {
      capturedCallback = cb
      return { on: vi.fn(), close: vi.fn() } as unknown as ReturnType<typeof createWatcher>
    })

    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)

    const mockServer = {
      watcher: { on: vi.fn() },
      moduleGraph: { getModuleById: vi.fn().mockReturnValue(null), invalidateModule: vi.fn() },
      ws: { send: vi.fn() },
    }
    await plugin.configureServer(mockServer)

    const callsBeforeEvent = vi.mocked(scanComposableExports).mock.calls.length
    await capturedCallback!('add', '/project/app/composables/use-new.ts')
    expect(vi.mocked(scanComposableExports).mock.calls.length).toBeGreaterThan(callsBeforeEvent)
  })

  it('does not trigger HMR on non-add/unlink events', async () => {
    const { createWatcher } = await import('../../plugin/scanner.js')

    let capturedCallback: ((event: string, file: string) => void) | null = null
    vi.mocked(createWatcher).mockImplementationOnce((_watcher, _dirs, cb) => {
      capturedCallback = cb
      return { on: vi.fn(), close: vi.fn() } as unknown as ReturnType<typeof createWatcher>
    })

    const plugin = getCerPlugin()
    plugin.config({ root: '/project' }, { command: 'serve', mode: 'development' })
    plugin.configResolved(FAKE_RESOLVED)

    const wsSend = vi.fn()
    const mockServer = {
      watcher: { on: vi.fn() },
      moduleGraph: { getModuleById: vi.fn().mockReturnValue(null), invalidateModule: vi.fn() },
      ws: { send: wsSend },
    }
    await plugin.configureServer(mockServer)
    wsSend.mockClear()

    await capturedCallback!('change', '/project/app/pages/index.ts')
    expect(wsSend).not.toHaveBeenCalled()
  })
})
