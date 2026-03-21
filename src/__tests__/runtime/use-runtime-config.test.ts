import { describe, it, expect, beforeEach } from 'vitest'
import { useRuntimeConfig, initRuntimeConfig } from '../../runtime/composables/use-runtime-config.js'

beforeEach(() => {
  // Reset global state between tests
  delete (globalThis as Record<string, unknown>).__cerRuntimeConfig
})

describe('initRuntimeConfig', () => {
  it('stores the config on globalThis', () => {
    initRuntimeConfig({ public: { apiBase: '/api' } })
    expect((globalThis as Record<string, unknown>).__cerRuntimeConfig).toEqual({ public: { apiBase: '/api' } })
  })

  it('overwrites a previous config', () => {
    initRuntimeConfig({ public: { apiBase: '/v1' } })
    initRuntimeConfig({ public: { apiBase: '/v2' } })
    const stored = (globalThis as Record<string, unknown>).__cerRuntimeConfig as { public: Record<string, unknown> }
    expect(stored.public.apiBase).toBe('/v2')
  })
})

describe('useRuntimeConfig', () => {
  it('returns empty public config when not initialized', () => {
    const config = useRuntimeConfig()
    expect(config.public).toEqual({})
  })

  it('returns the config set by initRuntimeConfig', () => {
    initRuntimeConfig({ public: { apiBase: '/api' } })
    const config = useRuntimeConfig()
    expect(config.public.apiBase).toBe('/api')
  })

  it('returns the full public config object', () => {
    initRuntimeConfig({ public: { apiBase: '/api', version: '1.0', debug: false } })
    const config = useRuntimeConfig()
    expect(config.public).toEqual({ apiBase: '/api', version: '1.0', debug: false })
  })

  it('returns a reference to the stored config (not a copy)', () => {
    const stored = { public: { apiBase: '/api' } }
    initRuntimeConfig(stored)
    const config = useRuntimeConfig()
    expect(config).toBe(stored)
  })

  it('reflects updates when initRuntimeConfig is called again', () => {
    initRuntimeConfig({ public: { key: 'first' } })
    initRuntimeConfig({ public: { key: 'second' } })
    expect(useRuntimeConfig().public.key).toBe('second')
  })

  it('handles empty public config', () => {
    initRuntimeConfig({ public: {} })
    const config = useRuntimeConfig()
    expect(config.public).toEqual({})
  })
})
