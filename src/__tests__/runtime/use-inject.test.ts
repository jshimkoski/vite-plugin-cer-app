/**
 * Tests for useInject — server-side (SSR/SSG) path.
 *
 * This file runs in the default 'node' environment where `document` is
 * undefined, so useInject() always takes the SSR branch: reading from
 * globalThis.__cerPluginProvides.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useInject } from '../../runtime/composables/use-inject.js'

const _g = globalThis as Record<string, unknown>

describe('useInject — server-side (SSR/SSG)', () => {
  beforeEach(() => {
    delete _g['__cerPluginProvides']
  })

  afterEach(() => {
    delete _g['__cerPluginProvides']
  })

  it('returns value from __cerPluginProvides when key is present', () => {
    _g['__cerPluginProvides'] = new Map([['my-service', { greet: () => 'hello' }]])
    const result = useInject<{ greet(): string }>('my-service')
    expect(typeof result?.greet).toBe('function')
    expect(result?.greet()).toBe('hello')
  })

  it('returns defaultValue when key is absent from the provides map', () => {
    _g['__cerPluginProvides'] = new Map()
    expect(useInject('missing', 'fallback')).toBe('fallback')
  })

  it('returns undefined when key is absent and no defaultValue is given', () => {
    _g['__cerPluginProvides'] = new Map()
    expect(useInject('missing')).toBeUndefined()
  })

  it('returns undefined when __cerPluginProvides is not set at all', () => {
    expect(useInject('my-service')).toBeUndefined()
  })

  it('returns defaultValue when __cerPluginProvides is not set and defaultValue is given', () => {
    expect(useInject('my-service', 'default')).toBe('default')
  })

  it('is generic and preserves the typed shape', () => {
    interface Store { count: number }
    const store: Store = { count: 42 }
    _g['__cerPluginProvides'] = new Map([['store', store]])
    const result = useInject<Store>('store')
    expect(result?.count).toBe(42)
  })

  it('is safe to call multiple times — does not consume the value', () => {
    _g['__cerPluginProvides'] = new Map([['key', 'value']])
    expect(useInject('key')).toBe('value')
    expect(useInject('key')).toBe('value')
  })

  it('supports multiple keys independently', () => {
    _g['__cerPluginProvides'] = new Map([['a', 1], ['b', 2]])
    expect(useInject('a')).toBe(1)
    expect(useInject('b')).toBe(2)
  })
})
