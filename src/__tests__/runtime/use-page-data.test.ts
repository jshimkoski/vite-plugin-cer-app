import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AsyncLocalStorage } from 'node:async_hooks'
import { usePageData } from '../../runtime/composables/use-page-data.js'

describe('usePageData', () => {
  beforeEach(() => {
    // Clean up global state between tests
    delete (globalThis as Record<string, unknown>)['__CER_DATA__']
    delete (globalThis as Record<string, unknown>)['__CER_DATA_STORE__']
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__CER_DATA_STORE__']
  })

  it('returns null when no SSR data is present', () => {
    expect(usePageData()).toBeNull()
  })

  it('returns the data when __CER_DATA__ is set on globalThis', () => {
    const data = { id: '1', name: 'Laptop', price: 999 }
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = data
    expect(usePageData()).toEqual(data)
  })

  it('does NOT clear __CER_DATA__ on read (cleared by app.ts after router.replace)', () => {
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { title: 'Hello' }
    usePageData()
    expect((globalThis as Record<string, unknown>)['__CER_DATA__']).toEqual({ title: 'Hello' })
  })

  it('returns the same data on subsequent calls (not consumed on first read)', () => {
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { title: 'Hello' }
    usePageData()
    expect(usePageData()).toEqual({ title: 'Hello' })
  })

  it('is generic and preserves the typed shape', () => {
    interface Post { slug: string; title: string }
    const post: Post = { slug: 'hello', title: 'Hello World' }
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = post
    const result = usePageData<Post>()
    expect(result?.slug).toBe('hello')
    expect(result?.title).toBe('Hello World')
  })

  it('returns null when __CER_DATA__ is explicitly null', () => {
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = null
    expect(usePageData()).toBeNull()
  })
})

describe('usePageData — AsyncLocalStorage (server-side)', () => {
  let store: AsyncLocalStorage<unknown>

  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)['__CER_DATA__']
    store = new AsyncLocalStorage()
    ;(globalThis as Record<string, unknown>)['__CER_DATA_STORE__'] = store
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__CER_DATA_STORE__']
    delete (globalThis as Record<string, unknown>)['__CER_DATA__']
  })

  it('reads data from the ALS store when available', () => {
    const data = { title: 'SSR Post', body: 'Hello from ALS' }
    store.run(data, () => {
      expect(usePageData()).toEqual(data)
    })
  })

  it('returns null when ALS store is empty (null)', () => {
    store.run(null, () => {
      expect(usePageData()).toBeNull()
    })
  })

  it('prefers ALS store over globalThis.__CER_DATA__', () => {
    const alsData = { source: 'als' }
    const globalData = { source: 'global' }
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = globalData
    store.run(alsData, () => {
      expect(usePageData()).toEqual(alsData)
    })
  })

  it('does NOT delete __CER_DATA__ when returning ALS data', () => {
    const globalData = { source: 'global' }
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = globalData
    store.run({ source: 'als' }, () => {
      usePageData()
    })
    // global data should still be present — ALS path doesn't consume it
    expect((globalThis as Record<string, unknown>)['__CER_DATA__']).toEqual(globalData)
  })

  it('falls back to __CER_DATA__ when ALS store has no value outside run()', () => {
    // Outside any store.run() context, getStore() returns undefined
    const data = { fallback: true }
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = data
    // store is set but we're outside a run() context → getStore() === undefined
    expect(usePageData()).toEqual(data)
  })

  it('returns null when both ALS and __CER_DATA__ are absent', () => {
    store.run(null, () => {
      expect(usePageData()).toBeNull()
    })
  })

  it('is safe to call multiple times inside same ALS context', () => {
    const data = { count: 42 }
    store.run(data, () => {
      expect(usePageData()).toEqual(data)
      // ALS data is NOT consumed on read, so a second call still returns it
      expect(usePageData()).toEqual(data)
    })
  })
})
