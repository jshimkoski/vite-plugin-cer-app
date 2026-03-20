/**
 * @vitest-environment happy-dom
 *
 * Tests for useInject — client-side path.
 *
 * Runs in happy-dom so `document` is defined, putting useInject() on the
 * client branch. inject() from the runtime is mocked since it requires a
 * live component context that doesn't exist in unit tests.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('@jasonshimmy/custom-elements-runtime', () => ({
  inject: vi.fn(),
}))

import { inject } from '@jasonshimmy/custom-elements-runtime'
import { useInject } from '../../runtime/composables/use-inject.js'

const _g = globalThis as Record<string, unknown>

describe('useInject — client-side', () => {
  beforeEach(() => {
    delete _g['__cerPluginProvides']
    vi.mocked(inject).mockReturnValue(undefined)
  })

  afterEach(() => {
    delete _g['__cerPluginProvides']
  })

  it('returns the value from inject() when the component context has it', () => {
    vi.mocked(inject).mockReturnValue('injected-value')
    expect(useInject('my-key')).toBe('injected-value')
  })

  it('falls back to __cerPluginProvides when inject() returns undefined', () => {
    _g['__cerPluginProvides'] = new Map([['my-key', 'plugin-provided']])
    expect(useInject('my-key')).toBe('plugin-provided')
  })

  it('inject() result takes priority over __cerPluginProvides', () => {
    vi.mocked(inject).mockReturnValue('inject-wins')
    _g['__cerPluginProvides'] = new Map([['my-key', 'global-value']])
    expect(useInject('my-key')).toBe('inject-wins')
  })

  it('returns defaultValue when inject() and provides both miss', () => {
    expect(useInject('missing', 'default')).toBe('default')
  })

  it('returns undefined when inject() and provides both miss with no defaultValue', () => {
    expect(useInject('missing')).toBeUndefined()
  })

  it('returns defaultValue when inject() returns undefined and key is absent from provides', () => {
    _g['__cerPluginProvides'] = new Map()
    expect(useInject('missing', 42)).toBe(42)
  })

  it('is generic and preserves the typed shape from inject()', () => {
    interface Service { call(): string }
    const svc: Service = { call: () => 'ok' }
    vi.mocked(inject).mockReturnValue(svc)
    const result = useInject<Service>('svc')
    expect(result?.call()).toBe('ok')
  })
})
