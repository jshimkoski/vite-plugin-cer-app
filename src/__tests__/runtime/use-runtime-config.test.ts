import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRuntimeConfig, initRuntimeConfig, resolvePrivateConfig } from '../../runtime/composables/use-runtime-config.js'

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

  it('returns private config when initialized with it', () => {
    initRuntimeConfig({ public: {}, private: { dbUrl: 'postgres://localhost', secretKey: 'abc' } })
    const config = useRuntimeConfig()
    expect(config.private).toEqual({ dbUrl: 'postgres://localhost', secretKey: 'abc' })
  })

  it('private is undefined when not supplied', () => {
    initRuntimeConfig({ public: { apiBase: '/api' } })
    const config = useRuntimeConfig()
    expect(config.private).toBeUndefined()
  })

  it('returns empty private config when initialized with empty object', () => {
    initRuntimeConfig({ public: {}, private: {} })
    expect(useRuntimeConfig().private).toEqual({})
  })
})

// ─── resolvePrivateConfig ─────────────────────────────────────────────────────

describe('resolvePrivateConfig', () => {
  it('resolves a key from the exact-case env var', () => {
    const result = resolvePrivateConfig({ dbUrl: '' }, { dbUrl: 'postgres://localhost' })
    expect(result.dbUrl).toBe('postgres://localhost')
  })

  it('resolves a key from the ALL_CAPS env var when exact case is absent', () => {
    const result = resolvePrivateConfig({ dbUrl: '' }, { DB_URL: 'postgres://prod' })
    expect(result.dbUrl).toBe('postgres://prod')
  })

  it('falls back to the declared default when neither env var is set', () => {
    const result = resolvePrivateConfig({ dbUrl: 'default-db' }, {})
    expect(result.dbUrl).toBe('default-db')
  })

  it('exact-case env var takes precedence over ALL_CAPS', () => {
    const result = resolvePrivateConfig({ dbUrl: '' }, { dbUrl: 'exact', DB_URL: 'caps' })
    expect(result.dbUrl).toBe('exact')
  })

  it('handles multiple keys independently', () => {
    const result = resolvePrivateConfig(
      { dbUrl: '', secretKey: '', apiToken: 'default-token' },
      { dbUrl: 'pg://host', SECRET_KEY: 's3cr3t' },
    )
    expect(result.dbUrl).toBe('pg://host')
    expect(result.secretKey).toBe('s3cr3t')
    expect(result.apiToken).toBe('default-token')
  })

  it('returns an empty object when defaults is empty', () => {
    expect(resolvePrivateConfig({}, { ANY: 'value' })).toEqual({})
  })

  it('preserves key names exactly as declared in output (does not rename keys)', () => {
    const result = resolvePrivateConfig({ camelCase: 'def' }, { CAMEL_CASE: 'val' })
    expect(Object.keys(result)).toEqual(['camelCase'])
    expect(result.camelCase).toBe('val')
  })

  it('emits a console.warn when a key has an empty-string default and no env var is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    resolvePrivateConfig({ dbUrl: '' }, {})
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('dbUrl')
    expect(warn.mock.calls[0][0]).toContain('DB_URL')
    warn.mockRestore()
  })

  it('does NOT warn when the env var supplies a value for an empty-default key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    resolvePrivateConfig({ dbUrl: '' }, { DB_URL: 'postgres://prod' })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does NOT warn when the declared default is non-empty and no env var is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    resolvePrivateConfig({ apiToken: 'fallback-token' }, {})
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
