/**
 * useFetch() — component context path.
 *
 * When useFetch() detects a component context via getCurrentComponentContext(),
 * it returns reactive UseFetchReactiveReturn (ReactiveState refs) and registers
 * useOnConnected to trigger the fetch automatically on mount.
 *
 * These tests mock @jasonshimmy/custom-elements-runtime to simulate a
 * component render environment without a real DOM.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─── Mock @jasonshimmy/custom-elements-runtime ────────────────────────────────

// Capture useOnConnected callbacks so tests can trigger them manually.
let _connectedCallbacks: Array<() => void | Promise<void>> = []

vi.mock('@jasonshimmy/custom-elements-runtime', () => ({
  // Return a non-null context so useFetch takes the component path.
  getCurrentComponentContext: vi.fn().mockReturnValue({ _id: 'test-component' }),
  // createComposable: run factory immediately, ignore explicit ctx arg.
  createComposable: (fn: () => unknown) => (_ctx?: unknown) => fn(),
  // Minimal ref: plain object with a settable .value accessor.
  ref: (initialValue: unknown) => {
    let _val = initialValue
    return {
      get value() { return _val },
      set value(v: unknown) { _val = v },
    }
  },
  // Capture callbacks for manual triggering in tests.
  useOnConnected: (cb: () => void | Promise<void>) => {
    _connectedCallbacks.push(cb)
  },
}))

import { useFetch } from '../../runtime/composables/use-fetch.js'
import type { UseFetchReactiveReturn } from '../../runtime/composables/use-fetch.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const g = globalThis as Record<string, unknown>

/** Flush all pending useOnConnected callbacks registered since last reset. */
async function triggerConnected() {
  for (const cb of _connectedCallbacks) await cb()
}

function mockFetchWith(response: unknown) {
  return vi.fn(async () => response)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useFetch() — component context path', () => {
  beforeEach(() => {
    _connectedCallbacks = []
    delete g['__CER_FETCH_STORE__']
    delete g['__CER_FETCH_DATA__']
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns reactive state refs (UseFetchReactiveReturn)', () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: true, json: async () => [] }))

    const result = useFetch('/api/items') as UseFetchReactiveReturn
    expect(result).toHaveProperty('data')
    expect(result).toHaveProperty('pending')
    expect(result).toHaveProperty('error')
    expect(result).toHaveProperty('refresh')
    // In component mode the fields are reactive state objects, not plain values.
    expect(typeof (result.data as { value: unknown }).value).not.toBe('undefined')
  })

  it('initialises data to null and pending to false before mount', () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: true, json: async () => [1, 2] }))

    const result = useFetch('/api/items') as UseFetchReactiveReturn
    expect(result.data.value).toBeNull()
    expect(result.pending.value).toBe(false)
    expect(result.error.value).toBeNull()
  })

  it('registers useOnConnected so fetch fires on mount', async () => {
    const mockFn = mockFetchWith({ ok: true, json: async () => [1, 2, 3] })
    vi.stubGlobal('fetch', mockFn)

    useFetch('/api/items')
    expect(_connectedCallbacks).toHaveLength(1)

    await triggerConnected()
    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  it('populates data.value after mount fetch completes', async () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: true, json: async () => ['a', 'b'] }))

    const result = useFetch<string[]>('/api/items') as UseFetchReactiveReturn<string[]>
    await triggerConnected()

    expect(result.data.value).toEqual(['a', 'b'])
    expect(result.pending.value).toBe(false)
    expect(result.error.value).toBeNull()
  })

  it('sets error.value on non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: false, status: 500, statusText: 'Server Error' }))

    const result = useFetch('/api/fail') as UseFetchReactiveReturn
    await triggerConnected()

    expect(result.error.value).toBeInstanceOf(Error)
    expect((result.error.value as Error).message).toContain('500')
    expect(result.data.value).toBeNull()
  })

  it('lazy: true skips useOnConnected registration', () => {
    const mockFn = vi.fn()
    vi.stubGlobal('fetch', mockFn)

    useFetch('/api/lazy', { lazy: true })
    expect(_connectedCallbacks).toHaveLength(0)
    expect(mockFn).not.toHaveBeenCalled()
  })

  it('server: false skips useOnConnected registration', () => {
    const mockFn = vi.fn()
    vi.stubGlobal('fetch', mockFn)

    useFetch('/api/client-only', { server: false })
    expect(_connectedCallbacks).toHaveLength(0)
  })

  it('refresh() re-issues the fetch and updates data.value', async () => {
    let callCount = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      callCount++
      return { ok: true, json: async () => callCount }
    }))

    const result = useFetch<number>('/api/counter') as UseFetchReactiveReturn<number>
    await triggerConnected()
    expect(result.data.value).toBe(1)

    await result.refresh()
    expect(result.data.value).toBe(2)
  })

  it('applies transform option', async () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: true, json: async () => [1, 2, 3] }))

    const result = useFetch<number>('/api/nums', {
      transform: (d) => (d as number[]).length,
    }) as UseFetchReactiveReturn<number>
    await triggerConnected()

    expect(result.data.value).toBe(3)
  })

  it('applies pick option', async () => {
    vi.stubGlobal('fetch', mockFetchWith({ ok: true, json: async () => ({ id: 1, name: 'Alice', secret: 'x' }) }))

    const result = useFetch('/api/user', { pick: ['id', 'name'] }) as UseFetchReactiveReturn
    await triggerConnected()

    expect(result.data.value).toEqual({ id: 1, name: 'Alice' })
    expect((result.data.value as Record<string, unknown>)['secret']).toBeUndefined()
  })

  it('default() sets initial data.value before fetch completes', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    const result = useFetch('/api/slow', { default: () => [] }) as UseFetchReactiveReturn
    expect(result.data.value).toEqual([])
  })

  it('appends query params to the URL', async () => {
    const mockFn = mockFetchWith({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', mockFn)

    useFetch('/api/search', { query: { q: 'test', page: '2' } })
    await triggerConnected()

    const calledUrl = (mockFn.mock.calls[0] as unknown[])[0] as string
    expect(calledUrl).toContain('q=test')
    expect(calledUrl).toContain('page=2')
  })

  it('sets error.value when fetch() itself throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Component network failure'))))

    const result = useFetch('/api/down') as UseFetchReactiveReturn
    await triggerConnected()

    expect(result.error.value).toBeInstanceOf(Error)
    expect((result.error.value as Error).message).toContain('Component network failure')
    expect(result.data.value).toBeNull()
  })

  it('accepts a url function and evaluates it on mount', async () => {
    const mockFn = mockFetchWith({ ok: true, json: async () => 'result' })
    vi.stubGlobal('fetch', mockFn)

    useFetch(() => '/api/computed-url')
    await triggerConnected()

    const calledUrl = (mockFn.mock.calls[0] as unknown[])[0] as string
    expect(calledUrl).toBe('/api/computed-url')
  })
})
