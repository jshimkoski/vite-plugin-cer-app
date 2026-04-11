import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(''),
  }
})
vi.mock('../../plugin/scanner.js', () => ({ scanDirectory: vi.fn().mockResolvedValue([]) }))
vi.mock('../../plugin/generated-dir.js', () => ({ GENERATED_DIR_NAME: '.cer' }))

import { existsSync, writeFileSync, readFileSync } from 'node:fs'
import { scanDirectory } from '../../plugin/scanner.js'
import {
  writeTsconfigPaths,
  scanComposableExports,
  generateAutoImportDts,
  generateVirtualModuleDts,
  writeAutoImportDts,
} from '../../plugin/dts-generator.js'

const ROOT = '/project'
const COMPOSABLES_DIR = '/project/app/composables'

beforeEach(() => {
  vi.mocked(existsSync).mockReturnValue(false)
  vi.mocked(writeFileSync).mockClear()
  vi.mocked(scanDirectory).mockResolvedValue([])
  vi.mocked(readFileSync).mockReturnValue('')
})

describe('writeTsconfigPaths', () => {
  it('writes tsconfig.json to the .cer directory', () => {
    writeTsconfigPaths(ROOT, `${ROOT}/app`)
    expect(writeFileSync).toHaveBeenCalledWith(
      `${ROOT}/.cer/tsconfig.json`,
      expect.any(String),
      'utf-8',
    )
  })

  it('includes ~/\\* path alias in tsconfig', () => {
    writeTsconfigPaths(ROOT, `${ROOT}/app`)
    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string
    expect(content).toContain('~/*')
  })

  it('includes ~/pages/* path alias', () => {
    writeTsconfigPaths(ROOT, `${ROOT}/app`)
    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string
    expect(content).toContain('~/pages/*')
  })

  it('generates valid JSON', () => {
    writeTsconfigPaths(ROOT, `${ROOT}/app`)
    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string
    expect(() => JSON.parse(content)).not.toThrow()
  })

  it('wraps paths in compilerOptions', () => {
    writeTsconfigPaths(ROOT, `${ROOT}/app`)
    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string
    const json = JSON.parse(content)
    expect(json).toHaveProperty('compilerOptions.paths')
  })

  it('includes project source directories in include array', () => {
    writeTsconfigPaths(ROOT, `${ROOT}/app`)
    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string
    const json = JSON.parse(content) as { include?: string[] }
    expect(Array.isArray(json.include)).toBe(true)
  })
})

describe('scanComposableExports', () => {
  it('returns empty map when composablesDir does not exist', async () => {
    const result = await scanComposableExports(COMPOSABLES_DIR)
    expect(result.size).toBe(0)
  })

  it('returns empty map when no files found', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    const result = await scanComposableExports(COMPOSABLES_DIR)
    expect(result.size).toBe(0)
  })

  it('finds exported functions', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(scanDirectory).mockResolvedValue([`${COMPOSABLES_DIR}/use-counter.ts`])
    vi.mocked(readFileSync).mockReturnValue('export function useCounter() {}')
    const result = await scanComposableExports(COMPOSABLES_DIR)
    expect(result.has('useCounter')).toBe(true)
    expect(result.get('useCounter')).toBe(`${COMPOSABLES_DIR}/use-counter.ts`)
  })

  it('finds exported const', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(scanDirectory).mockResolvedValue([`${COMPOSABLES_DIR}/use-state.ts`])
    vi.mocked(readFileSync).mockReturnValue('export const useState = () => {}')
    const result = await scanComposableExports(COMPOSABLES_DIR)
    expect(result.has('useState')).toBe(true)
  })

  it('finds multiple exports from a single file', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(scanDirectory).mockResolvedValue([`${COMPOSABLES_DIR}/utils.ts`])
    vi.mocked(readFileSync).mockReturnValue(`
export function useFoo() {}
export const useBar = () => {}
    `)
    const result = await scanComposableExports(COMPOSABLES_DIR)
    expect(result.has('useFoo')).toBe(true)
    expect(result.has('useBar')).toBe(true)
  })

  it('handles multiple files', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(scanDirectory).mockResolvedValue([
      `${COMPOSABLES_DIR}/a.ts`,
      `${COMPOSABLES_DIR}/b.ts`,
    ])
    vi.mocked(readFileSync)
      .mockReturnValueOnce('export function useA() {}')
      .mockReturnValueOnce('export function useB() {}')
    const result = await scanComposableExports(COMPOSABLES_DIR)
    expect(result.has('useA')).toBe(true)
    expect(result.has('useB')).toBe(true)
  })
})

describe('generateAutoImportDts', () => {
  it('includes AUTO-GENERATED comment', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('AUTO-GENERATED')
  })

  it('declares component as a global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const component: typeof import('@jasonshimmy/custom-elements-runtime')['component']")
  })

  it('declares html as a global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const html: typeof import('@jasonshimmy/custom-elements-runtime')['html']")
  })

  it('declares ref as a global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const ref: typeof import('@jasonshimmy/custom-elements-runtime')['ref']")
  })

  it('declares useHead as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const useHead: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['useHead']")
  })

  it('declares usePageData as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const usePageData: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['usePageData']")
  })

  it('declares useInject as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const useInject: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['useInject']")
  })

  it('declares useRuntimeConfig as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const useRuntimeConfig: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['useRuntimeConfig']")
  })

  it('declares defineMiddleware as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const defineMiddleware: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['defineMiddleware']")
  })

  it('declares defineServerMiddleware as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const defineServerMiddleware: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['defineServerMiddleware']")
  })

  it('declares useSeoMeta as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const useSeoMeta: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['useSeoMeta']")
  })

  it('declares useCookie as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const useCookie: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['useCookie']")
  })

  it('declares useSession as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const useSession: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['useSession']")
  })

  it('declares useAuth as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const useAuth: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['useAuth']")
  })

  it('declares useFetch as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const useFetch: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['useFetch']")
  })

  it('declares useRoute as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const useRoute: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['useRoute']")
  })

  it('declares navigateTo as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const navigateTo: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['navigateTo']")
  })

  it('declares useState as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const useState: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['useState']")
  })

  it('declares useLocale as a framework global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const useLocale: typeof import('@jasonshimmy/vite-plugin-cer-app/composables')['useLocale']")
  })

  it('declares when directive as a global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("const when: typeof import('@jasonshimmy/custom-elements-runtime/directives')['when']")
  })

  it('declares __CER_DATA__ global variable', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('var __CER_DATA__')
  })

  it('declares __CER_STATE_INIT__ global variable', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('var __CER_STATE_INIT__')
  })

  it('wraps declarations in declare global block', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('declare global {')
    expect(dts).toContain('}')
  })

  it('includes user composable exports when provided', async () => {
    const exports = new Map([['useMyThing', `${COMPOSABLES_DIR}/my-thing.ts`]])
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR, exports)
    expect(dts).toContain('useMyThing')
  })

  it('uses relative path for user composables', async () => {
    const exports = new Map([['useFoo', `${ROOT}/app/composables/foo.ts`]])
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR, exports)
    // Path should be relative from root
    expect(dts).toContain('./app/composables/foo')
  })
})

describe('generateVirtualModuleDts', () => {
  it('includes AUTO-GENERATED comment', async () => {
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('AUTO-GENERATED')
  })

  it('declares virtual:cer-routes module', async () => {
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("declare module 'virtual:cer-routes'")
  })

  it('declares virtual:cer-layouts module', async () => {
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("declare module 'virtual:cer-layouts'")
  })

  it('declares virtual:cer-plugins module', async () => {
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("declare module 'virtual:cer-plugins'")
  })

  it('declares virtual:cer-loading module with hasLoading and loadingTag', async () => {
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("declare module 'virtual:cer-loading'")
    expect(dts).toContain('hasLoading')
    expect(dts).toContain('loadingTag')
  })

  it('declares virtual:cer-error module with hasError and errorTag', async () => {
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("declare module 'virtual:cer-error'")
    expect(dts).toContain('hasError')
    expect(dts).toContain('errorTag')
  })

  it('declares virtual:cer-app-config module', async () => {
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("declare module 'virtual:cer-app-config'")
  })

  it('declares runtimeConfig export in virtual:cer-app-config', async () => {
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('runtimeConfig')
  })

  it('declares RuntimePublicConfig in virtual:cer-app-config', async () => {
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('RuntimePublicConfig')
  })

  it('declares _authSessionKey in virtual:cer-app-config', async () => {
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('_authSessionKey')
  })

  it('declares virtual:cer-server-middleware module', async () => {
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("declare module 'virtual:cer-server-middleware'")
  })

  it('declares virtual:cer-middleware module', async () => {
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain("declare module 'virtual:cer-middleware'")
  })

  it('includes user composable re-exports in virtual:cer-composables', async () => {
    const exports = new Map([['useMyThing', `${ROOT}/app/composables/my-thing.ts`]])
    const dts = await generateVirtualModuleDts(ROOT, COMPOSABLES_DIR, exports)
    expect(dts).toContain('useMyThing')
  })
})

describe('writeAutoImportDts', () => {
  it('writes auto-imports.d.ts to .cer/', async () => {
    await writeAutoImportDts(ROOT, COMPOSABLES_DIR)
    const paths = vi.mocked(writeFileSync).mock.calls.map(([p]) => String(p))
    expect(paths.some(p => p.includes('.cer/auto-imports.d.ts'))).toBe(true)
  })

  it('writes env.d.ts to .cer/', async () => {
    await writeAutoImportDts(ROOT, COMPOSABLES_DIR)
    const paths = vi.mocked(writeFileSync).mock.calls.map(([p]) => String(p))
    expect(paths.some(p => p.includes('.cer/env.d.ts'))).toBe(true)
  })

  it('writes exactly two files', async () => {
    await writeAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(writeFileSync).toHaveBeenCalledTimes(2)
  })
})

// ─── Content layer globals ────────────────────────────────────────────────────

describe('generateAutoImportDts — content layer globals', () => {
  it('declares queryContent as a global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('queryContent')
  })

  it('declares useContentSearch as a global', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('useContentSearch')
  })

  it('declares ContentItem type in global scope', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('type ContentItem')
  })

  it('declares ContentMeta type in global scope', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('type ContentMeta')
  })

  it('declares ContentHeading type in global scope', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('type ContentHeading')
  })

  it('declares ContentSearchResult type in global scope', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('type ContentSearchResult')
  })

  it('declares __CER_APP_CONFIG__ global var', async () => {
    const dts = await generateAutoImportDts(ROOT, COMPOSABLES_DIR)
    expect(dts).toContain('__CER_APP_CONFIG__')
  })
})
