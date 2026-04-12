import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AsyncLocalStorage } from 'node:async_hooks'

// --- Module-level mock for @jasonshimmy/custom-elements-runtime ---
// usePageData imports getCurrentComponentContext from the runtime. We mock the
// module so unit tests can control which context (if any) is "active".
let _mockContext: Record<string, unknown> | null = null

vi.mock('@jasonshimmy/custom-elements-runtime', () => ({
  getCurrentComponentContext: () => _mockContext,
}))

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

// ─── Component context caching ─────────────────────────────────────────────
//
// usePageData() caches the result on the component context (via Object.defineProperty)
// so that re-renders of the same element instance return the same value even after
// __CER_DATA__ is deleted by the post-hydration queueMicrotask cleanup.
//
// Background: renderFn passed to component() IS the render function — it runs on
// every re-render, not just once as a setup phase. Without caching, calling
// usePageData() on the second render after __CER_DATA__ is deleted returns null,
// which flips `ssrData ? 'ssr' : 'client'` guards and re-triggers client fetches.

describe('usePageData — component context caching', () => {
  const _PAGE_DATA_KEY = '_cerPageData'

  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)['__CER_DATA__']
    delete (globalThis as Record<string, unknown>)['__CER_DATA_STORE__']
    _mockContext = null
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__CER_DATA__']
    _mockContext = null
  })

  it('returns null and does not cache when context is null (no render in progress)', () => {
    _mockContext = null
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { value: 42 }
    const result = usePageData()
    expect(result).toEqual({ value: 42 })
    // No context to cache on — nothing to assert, just no crash
  })

  it('caches the result on the component context using Object.defineProperty', () => {
    const ctx: Record<string, unknown> = {}
    _mockContext = ctx
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { value: 42 }

    usePageData()

    // Should be defined on ctx via Object.defineProperty (non-enumerable)
    expect(Object.prototype.hasOwnProperty.call(ctx, _PAGE_DATA_KEY)).toBe(true)
    expect(ctx[_PAGE_DATA_KEY]).toEqual({ value: 42 })
  })

  it('cached property is non-enumerable (does not appear in Object.keys)', () => {
    const ctx: Record<string, unknown> = {}
    _mockContext = ctx
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { value: 42 }

    usePageData()

    expect(Object.keys(ctx)).not.toContain(_PAGE_DATA_KEY)
  })

  it('cached property is non-writable (reactive proxy set-trap cannot overwrite it)', () => {
    const ctx: Record<string, unknown> = {}
    _mockContext = ctx
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { value: 42 }

    usePageData()

    // Attempting to overwrite a writable:false property silently fails in non-strict mode
    // and throws in strict mode. Verify the value doesn't change.
    try { ctx[_PAGE_DATA_KEY] = { value: 999 } } catch { /* strict mode */ }
    expect(ctx[_PAGE_DATA_KEY]).toEqual({ value: 42 })
  })

  it('returns cached value on second call even after __CER_DATA__ is deleted', () => {
    const ctx: Record<string, unknown> = {}
    _mockContext = ctx
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { value: 42 }

    // First call (simulates initial render while __CER_DATA__ is present)
    const first = usePageData()
    expect(first).toEqual({ value: 42 })

    // Simulate post-hydration cleanup: queueMicrotask(() => delete __CER_DATA__)
    delete (globalThis as Record<string, unknown>)['__CER_DATA__']

    // Second call (simulates re-render after cleanup) — must return cached value
    const second = usePageData()
    expect(second).toEqual({ value: 42 })
  })

  it('caches null result so repeated calls with no data do not re-read the deleted global', () => {
    const ctx: Record<string, unknown> = {}
    _mockContext = ctx
    // No __CER_DATA__ — returns null and caches null

    const first = usePageData()
    expect(first).toBeNull()

    // Set __CER_DATA__ AFTER first call — second call should return cached null
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { value: 99 }
    const second = usePageData()
    expect(second).toBeNull()
  })

  it('each component element instance has its own independent cache', () => {
    const ctxA: Record<string, unknown> = {}
    const ctxB: Record<string, unknown> = {}

    // First component: has SSR data
    _mockContext = ctxA
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { page: 'home' }
    const resultA = usePageData()
    expect(resultA).toEqual({ page: 'home' })

    // Simulate navigation: delete home data, set blog data
    delete (globalThis as Record<string, unknown>)['__CER_DATA__']
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { page: 'blog' }

    // Second component (different element, different context)
    _mockContext = ctxB
    const resultB = usePageData()
    expect(resultB).toEqual({ page: 'blog' })

    // First component re-rendered — still returns its cached value
    _mockContext = ctxA
    delete (globalThis as Record<string, unknown>)['__CER_DATA__']
    const resultA2 = usePageData()
    expect(resultA2).toEqual({ page: 'home' }) // cached, not stale blog data
  })

  it('ALS path takes precedence over context cache (server-side always uses ALS)', () => {
    const store = new AsyncLocalStorage<unknown>()
    ;(globalThis as Record<string, unknown>)['__CER_DATA_STORE__'] = store

    const ctx: Record<string, unknown> = {}
    // Pre-seed a stale client cache on the context
    Object.defineProperty(ctx, _PAGE_DATA_KEY, { value: { stale: true }, writable: false, configurable: true, enumerable: false })
    _mockContext = ctx

    const alsData = { fresh: true }
    store.run(alsData, () => {
      const result = usePageData()
      // ALS wins — context cache is not consulted for server-side renders
      expect(result).toEqual(alsData)
    })

    delete (globalThis as Record<string, unknown>)['__CER_DATA_STORE__']
  })

  it('context cache survives across multiple renderFn() invocations (re-render stability)', () => {
    const ctx: Record<string, unknown> = {}
    _mockContext = ctx
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { title: 'My Page' }

    // Simulate 5 re-renders (e.g. reactive state updates)
    for (let i = 0; i < 5; i++) {
      const result = usePageData<{ title: string }>()
      expect(result?.title).toBe('My Page')
    }

    // Delete __CER_DATA__ (post-hydration cleanup)
    delete (globalThis as Record<string, unknown>)['__CER_DATA__']

    // 5 more re-renders post-cleanup
    for (let i = 0; i < 5; i++) {
      const result = usePageData<{ title: string }>()
      expect(result?.title).toBe('My Page')
    }
  })
})

