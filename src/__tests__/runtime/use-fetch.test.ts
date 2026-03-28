/**
 * useFetch() composable tests.
 *
 * Exercises:
 * - SSR path (writes to __CER_FETCH_STORE__ ALS)
 * - Client hydration path (reads from globalThis.__CER_FETCH_DATA__)
 * - Client fetch path (native fetch)
 * - Lazy / server:false skip
 * - pick, transform, key, query options
 * - Thenable (await useFetch())
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFetch } from '../../runtime/composables/use-fetch.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const g = globalThis as Record<string, unknown>

function mockFetchWith(response: unknown) {
  return vi.fn(async () => response)
}

/** Runs fn inside a fresh per-request fetch store. */
async function runWithFetchStore(fn: (map: Map<string, unknown>) => Promise<void>) {
  const { AsyncLocalStorage } = require('node:async_hooks')
  const store = new AsyncLocalStorage()
  const map = new Map<string, unknown>()
  g['__CER_FETCH_STORE__'] = store
  try {
    await store.run(map, () => fn(map))
  } finally {
    delete g['__CER_FETCH_STORE__']
  }
}

// ─── SSR path ─────────────────────────────────────────────────────────────────

describe('useFetch() — SSR path', () => {
  afterEach(() => {
    delete g['__CER_FETCH_STORE__']
    vi.unstubAllGlobals()
  })

  it('fetches and resolves data via await', async () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: true, json: async () => [{ id: 1 }] }))

    await runWithFetchStore(async (map) => {
      const result = await useFetch('/api/posts')
      expect(result.data).toEqual([{ id: 1 }])
      expect(result.pending).toBe(false)
      expect(result.error).toBeNull()
      expect(map.has('/api/posts')).toBe(true)
    })
  })

  it('caches repeated calls for the same key within one request', async () => {
    const mockFn = mockFetchWith({ ok: true, json: async () => ({ cached: true }) })
    vi.stubGlobal('fetch', mockFn)

    await runWithFetchStore(async () => {
      await useFetch('/api/item')
      await useFetch('/api/item') // second call — should hit cache
      expect(mockFn).toHaveBeenCalledTimes(1)
    })
  })

  it('applies pick option', async () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: true, json: async () => ({ id: 1, name: 'Alice', secret: 'x' }) }))

    await runWithFetchStore(async () => {
      const result = await useFetch('/api/user', { pick: ['id', 'name'] })
      expect(result.data).toEqual({ id: 1, name: 'Alice' })
      expect((result.data as Record<string, unknown>)['secret']).toBeUndefined()
    })
  })

  it('applies transform option', async () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: true, json: async () => [1, 2, 3] }))

    await runWithFetchStore(async () => {
      const result = await useFetch<number>('/api/nums', { transform: (d) => (d as number[]).length })
      expect(result.data).toBe(3)
    })
  })

  it('sets error on non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: false, status: 404, statusText: 'Not Found' }))

    await runWithFetchStore(async () => {
      const result = await useFetch('/api/missing')
      expect(result.error).toBeInstanceOf(Error)
      expect(result.error!.message).toContain('404')
      expect(result.data).toBeNull()
    })
  })

  it('lazy: true skips the SSR fetch', async () => {
    const mockFn = vi.fn()
    vi.stubGlobal('fetch', mockFn)

    await runWithFetchStore(async () => {
      const result = await useFetch('/api/lazy', { lazy: true })
      expect(result.data).toBeNull()
      expect(mockFn).not.toHaveBeenCalled()
    })
  })

  it('server: false skips the SSR fetch', async () => {
    const mockFn = vi.fn()
    vi.stubGlobal('fetch', mockFn)

    await runWithFetchStore(async () => {
      await useFetch('/api/client-only', { server: false })
      expect(mockFn).not.toHaveBeenCalled()
    })
  })

  it('appends query params to the URL', async () => {
    const mockFn = mockFetchWith({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', mockFn)

    await runWithFetchStore(async () => {
      await useFetch('/api/search', { query: { q: 'hello', page: '1' } })
      const calledUrl = (mockFn.mock.calls[0] as unknown[])[0] as string
      expect(calledUrl).toContain('q=hello')
      expect(calledUrl).toContain('page=1')
    })
  })

  it('uses custom key option for caching', async () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: true, json: async () => 42 }))

    await runWithFetchStore(async (map) => {
      await useFetch('/api/value', { key: 'my-key' })
      expect(map.has('my-key')).toBe(true)
      expect(map.has('/api/value')).toBe(false)
    })
  })

  it('sets error when fetch() throws during SSR (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('SSR network failure'))))

    await runWithFetchStore(async () => {
      const result = await useFetch('/api/down')
      expect(result.error).toBeInstanceOf(Error)
      expect(result.error!.message).toContain('SSR network failure')
      expect(result.data).toBeNull()
    })
  })

  it('sends POST with body during SSR', async () => {
    const mockFn = mockFetchWith({ ok: true, json: async () => ({ id: 1 }) })
    vi.stubGlobal('fetch', mockFn)

    await runWithFetchStore(async () => {
      await useFetch('/api/create', { method: 'POST', body: { title: 'hello' } })
      const [, init] = mockFn.mock.calls[0] as [string, RequestInit]
      expect(init.method).toBe('POST')
      expect(init.body).toBe(JSON.stringify({ title: 'hello' }))
    })
  })
})

// ─── Client hydration path ────────────────────────────────────────────────────

describe('useFetch() — client hydration path', () => {
  beforeEach(() => {
    delete g['__CER_FETCH_STORE__']
  })

  afterEach(() => {
    delete g['__CER_FETCH_DATA__']
    vi.unstubAllGlobals()
  })

  it('reads pre-fetched data without issuing a fetch', async () => {
    const mockFn = vi.fn()
    vi.stubGlobal('fetch', mockFn)
    g['__CER_FETCH_DATA__'] = { '/api/posts': [{ id: 1 }] }

    const result = await useFetch('/api/posts')
    expect(result.data).toEqual([{ id: 1 }])
    expect(mockFn).not.toHaveBeenCalled()
  })

  it('consumes the hydration key so a second call fetches fresh', async () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: true, json: async () => 'fresh' }))
    g['__CER_FETCH_DATA__'] = { '/api/x': 'cached' }

    const first = await useFetch('/api/x')
    expect(first.data).toBe('cached')

    const second = await useFetch('/api/x')
    expect(second.data).toBe('fresh')
  })
})

// ─── Client fetch path ────────────────────────────────────────────────────────

describe('useFetch() — client fetch path', () => {
  beforeEach(() => {
    delete g['__CER_FETCH_STORE__']
    delete g['__CER_FETCH_DATA__']
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('issues a fetch and resolves data', async () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: true, json: async () => ({ value: 7 }) }))

    const result = await useFetch('/api/val')
    expect(result.data).toEqual({ value: 7 })
    expect(result.pending).toBe(false)
    expect(result.error).toBeNull()
  })

  it('lazy: true does not auto-fetch on the client', () => {
    const mockFn = vi.fn()
    vi.stubGlobal('fetch', mockFn)

    const result = useFetch('/api/nofetch', { lazy: true })
    expect(result.pending).toBe(false)
    expect(mockFn).not.toHaveBeenCalled()
  })

  it('refresh() re-issues the fetch', async () => {
    let callCount = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount++
      return { ok: true, json: async () => callCount }
    }))

    const result = await useFetch<number>('/api/counter')
    expect(result.data).toBe(1)

    await result.refresh()
    expect(result.data).toBe(2)
  })

  it('default() provides initial value before fetch completes', async () => {
    let resolveFetch!: (v: unknown) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { resolveFetch = r })))

    const result = useFetch('/api/slow', { default: () => [] as unknown[] })
    expect(result.data).toEqual([])
    expect(result.pending).toBe(true)

    resolveFetch({ ok: true, json: async () => [] })
    await result
  })

  it('sets error when fetch() itself throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Network failure'))))

    const result = await useFetch('/api/down')
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error!.message).toContain('Network failure')
    expect(result.data).toBeNull()
    expect(result.pending).toBe(false)
  })

  it('sends POST with JSON body and Content-Type header', async () => {
    const mockFn = mockFetchWith({ ok: true, json: async () => ({ created: true }) })
    vi.stubGlobal('fetch', mockFn)

    await useFetch('/api/items', { method: 'POST', body: { name: 'test' } })

    const [, init] = mockFn.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ name: 'test' }))
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('accepts a url function and evaluates it at call time', async () => {
    const mockFn = mockFetchWith({ ok: true, json: async () => 42 })
    vi.stubGlobal('fetch', mockFn)

    let currentId = 1
    await useFetch(() => `/api/items/${currentId}`)

    const calledUrl = (mockFn.mock.calls[0] as unknown[])[0] as string
    expect(calledUrl).toBe('/api/items/1')
  })

  it('refresh() on a hydrated-state result issues a new fetch', async () => {
    // Pre-populate __CER_FETCH_DATA__ so the first call uses the hydrated path
    g['__CER_FETCH_DATA__'] = { '/api/item': { id: 1 } }

    let callCount = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount++
      return { ok: true, json: async () => ({ id: callCount + 10 }) }
    }))

    const result = await useFetch<{ id: number }>('/api/item')
    // Should have consumed the hydrated value, not fetched
    expect(result.data).toEqual({ id: 1 })
    expect(callCount).toBe(0)

    // refresh() should now issue a real fetch
    await result.refresh()
    expect(callCount).toBe(1)
    expect(result.data).toEqual({ id: 11 })
  })
})

// ─── P2-3: Client-side in-flight deduplication ────────────────────────────────

describe('useFetch() — client in-flight deduplication (P2-3)', () => {
  beforeEach(() => {
    delete g['__CER_FETCH_STORE__']
    delete g['__CER_FETCH_DATA__']
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('issues only one HTTP request when two calls with the same key are concurrent', async () => {
    let resolveFirst!: (v: unknown) => void
    let fetchCallCount = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      fetchCallCount++
      return new Promise((resolve) => { resolveFirst = resolve })
    }))

    // Start two concurrent fetches
    const p1 = useFetch<number[]>('/api/items')
    const p2 = useFetch<number[]>('/api/items')

    // Resolve the shared in-flight request
    resolveFirst({ ok: true, json: async () => [1, 2, 3] })

    await p1
    await p2

    // Only one actual HTTP call despite two useFetch calls
    expect(fetchCallCount).toBe(1)
    expect(p1.data).toEqual([1, 2, 3])
    expect(p2.data).toEqual([1, 2, 3])
  })

  it('each caller applies its own transform to the shared raw response', async () => {
    let resolveShared!: (v: unknown) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveShared = resolve })))

    const p1 = useFetch<number>('/api/nums', { transform: (d) => (d as number[]).length })
    const p2 = useFetch<number[]>('/api/nums')

    resolveShared({ ok: true, json: async () => [10, 20, 30] })
    await p1
    await p2

    // p1 transformed (count), p2 raw
    expect(p1.data).toBe(3)
    expect(p2.data).toEqual([10, 20, 30])
  })

  it('a second fetch after the first has settled issues a fresh HTTP request', async () => {
    let callCount = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount++
      return { ok: true, json: async () => callCount }
    }))

    const first = await useFetch<number>('/api/seq')
    expect(first.data).toBe(1)

    // Wait a tick — first request is done, _inflight map entry is removed
    const second = await useFetch<number>('/api/seq')
    expect(second.data).toBe(2)
    expect(callCount).toBe(2)
  })
})
