/**
 * useState() composable tests.
 *
 * Covers:
 * - Client path: singleton Map on globalThis.__CER_STATE__
 * - SSR path: per-request Map via AsyncLocalStorage (__CER_STATE_STORE__)
 * - SSR→client hydration: __CER_STATE_INIT__ pre-populates client Map
 * - SSR serialization: v.value is readable from ALS Map refs (mirrors entry-server-template)
 * - Full round-trip: SSR ALS → serialize → __CER_STATE_INIT__ → client hydration
 * - Shared ref semantics (same key → same ref)
 * - Factory init called only once
 * - Concurrent SSR isolation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AsyncLocalStorage } from 'node:async_hooks'
import { useState } from '../../runtime/composables/use-state.js'

const g = globalThis as Record<string, unknown>

function cleanup() {
  delete g['__CER_STATE_STORE__']
  delete g['__CER_STATE__']
  delete g['__CER_STATE_INIT__']
}

// ─── Client path ──────────────────────────────────────────────────────────────

describe('useState() — client path (singleton Map)', () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it('creates a reactive ref with the init value', () => {
    const title = useState('title', 'Hello')
    expect(title.value).toBe('Hello')
  })

  it('returns the same ref object for the same key', () => {
    const a = useState('counter', 0)
    const b = useState('counter')
    expect(a).toBe(b)
  })

  it('ignores init on subsequent calls for the same key', () => {
    const a = useState('theme', 'light')
    const b = useState('theme', 'dark')
    expect(a.value).toBe('light')
    expect(b.value).toBe('light')
    expect(a).toBe(b)
  })

  it('mutations are visible across all refs sharing the same key', () => {
    const a = useState('count', 0)
    const b = useState('count')
    a.value = 42
    expect(b.value).toBe(42)
  })

  it('accepts a factory function as init', () => {
    const state = useState('complex', () => ({ nested: true }))
    expect(state.value).toEqual({ nested: true })
  })

  it('factory is only called once even when useState is called multiple times', () => {
    let calls = 0
    const factory = () => { calls++; return 'initial' }
    useState('factory-key', factory)
    useState('factory-key', factory)
    expect(calls).toBe(1)
  })

  it('different keys produce independent refs', () => {
    const a = useState('key-a', 1)
    const b = useState('key-b', 2)
    a.value = 99
    expect(b.value).toBe(2)
  })

  it('works without an init value (value is null)', () => {
    const state = useState<string | null>('noInit')
    expect(state.value).toBeNull()
  })

  it('lazily initializes globalThis.__CER_STATE__ on first call', () => {
    expect(g['__CER_STATE__']).toBeUndefined()
    useState('lazy', 'x')
    expect(g['__CER_STATE__']).toBeDefined()
  })
})

// ─── SSR → client hydration ───────────────────────────────────────────────────

describe('useState() — SSR→client hydration (__CER_STATE_INIT__)', () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it('pre-populates the client Map from __CER_STATE_INIT__ on first call', () => {
    g['__CER_STATE_INIT__'] = { pageTitle: 'SSR Title', count: 42 }
    const title = useState<string>('pageTitle')
    expect(title.value).toBe('SSR Title')
    const count = useState<number>('count')
    expect(count.value).toBe(42)
  })

  it('SSR-hydrated value takes precedence over init', () => {
    g['__CER_STATE_INIT__'] = { pageTitle: 'From Server' }
    const title = useState<string>('pageTitle', 'Default Title')
    expect(title.value).toBe('From Server')
  })

  it('keys not in __CER_STATE_INIT__ still use their init value', () => {
    g['__CER_STATE_INIT__'] = { pageTitle: 'From Server' }
    const other = useState<string>('otherKey', 'my-default')
    expect(other.value).toBe('my-default')
  })

  it('returns the same ref for a key already hydrated from SSR', () => {
    g['__CER_STATE_INIT__'] = { foo: 'bar' }
    const a = useState<string>('foo')
    const b = useState<string>('foo')
    expect(a).toBe(b)
  })

  it('mutations to hydrated refs are shared across all callers', () => {
    g['__CER_STATE_INIT__'] = { theme: 'light' }
    const a = useState<string>('theme')
    const b = useState<string>('theme')
    a.value = 'dark'
    expect(b.value).toBe('dark')
  })

  it('does nothing when __CER_STATE_INIT__ is absent', () => {
    const state = useState('key', 'client-default')
    expect(state.value).toBe('client-default')
  })

  it('ignores __CER_STATE_INIT__ when __CER_STATE__ Map already exists', () => {
    // Simulate: Map already created before __CER_STATE_INIT__ is checked
    g['__CER_STATE__'] = new Map()
    g['__CER_STATE_INIT__'] = { pageTitle: 'Should Be Ignored' }
    const title = useState<string>('pageTitle', 'From Init Param')
    // __CER_STATE_INIT__ is skipped because Map already exists; init param is used
    expect(title.value).toBe('From Init Param')
  })

  it('hydrates null values from __CER_STATE_INIT__', () => {
    g['__CER_STATE_INIT__'] = { nullable: null }
    const state = useState<null>('nullable')
    expect(state.value).toBeNull()
  })

  it('hydrates object values from __CER_STATE_INIT__', () => {
    g['__CER_STATE_INIT__'] = { user: { id: 1, name: 'Alice' } }
    const state = useState<{ id: number; name: string }>('user')
    expect(state.value).toEqual({ id: 1, name: 'Alice' })
  })

  it('hydrates array values from __CER_STATE_INIT__', () => {
    g['__CER_STATE_INIT__'] = { items: [1, 2, 3] }
    const state = useState<number[]>('items')
    expect(state.value).toEqual([1, 2, 3])
  })
})

// ─── SSR path ─────────────────────────────────────────────────────────────────

describe('useState() — SSR path (__CER_STATE_STORE__ ALS)', () => {
  let store: AsyncLocalStorage<Map<string, unknown>>

  beforeEach(() => {
    cleanup()
    store = new AsyncLocalStorage()
    g['__CER_STATE_STORE__'] = store
  })

  afterEach(cleanup)

  it('creates a ref with the init value inside run()', () => {
    store.run(new Map(), () => {
      const title = useState('title', 'SSR Page')
      expect(title.value).toBe('SSR Page')
    })
  })

  it('returns the same ref for the same key within the same run()', () => {
    store.run(new Map(), () => {
      const a = useState('counter', 0)
      const b = useState('counter')
      expect(a).toBe(b)
    })
  })

  it('state written before rendering is visible to layout in same ALS context', () => {
    store.run(new Map(), () => {
      // Simulate loader setting state before render
      const fromLoader = useState('pageTitle', 'Set by loader')
      // Simulate layout reading state during render
      const fromLayout = useState('pageTitle', 'Layout fallback')
      expect(fromLayout.value).toBe('Set by loader')
      expect(fromLoader).toBe(fromLayout)
    })
  })

  it('concurrent requests have isolated state', async () => {
    const results: string[] = []
    await Promise.all([
      store.run(new Map(), async () => {
        useState('title', 'Request A')
        await new Promise(r => setTimeout(r, 5))
        results.push(useState<string>('title').value as string)
      }),
      store.run(new Map(), async () => {
        useState('title', 'Request B')
        await new Promise(r => setTimeout(r, 1))
        results.push(useState<string>('title').value as string)
      }),
    ])
    expect(results).toContain('Request A')
    expect(results).toContain('Request B')
  })

  it('falls back to client Map when called outside a run() context', () => {
    // Store is on globalThis but no active run() — getStore() returns undefined
    const state = useState('fallthrough', 'client-init')
    expect(state.value).toBe('client-init')
    expect(g['__CER_STATE__']).toBeDefined()
  })

  it('ignores client Map when inside ALS context', () => {
    // Pre-populate the client map with a conflicting value
    g['__CER_STATE__'] = new Map([['key', { value: 'client-value' }]])
    store.run(new Map(), () => {
      const state = useState('key', 'ssr-value')
      expect(state.value).toBe('ssr-value')
    })
  })

  it('accepts a factory init on SSR', () => {
    store.run(new Map(), () => {
      const state = useState('data', () => [1, 2, 3])
      expect(state.value).toEqual([1, 2, 3])
    })
  })
})

// ─── SSR serialization ────────────────────────────────────────────────────────
//
// Validates that the Map entries written by useState() on the server expose
// .value (ref semantics), which is exactly what entry-server-template reads:
//   for (const [k, v] of _stateMap) { _stateObj[k] = v.value }

describe('useState() — SSR serialization (v.value readable from ALS Map)', () => {
  let store: AsyncLocalStorage<Map<string, unknown>>

  beforeEach(() => {
    cleanup()
    store = new AsyncLocalStorage()
    g['__CER_STATE_STORE__'] = store
  })

  afterEach(cleanup)

  it('refs in the ALS Map expose .value matching what was set', () => {
    store.run(new Map(), () => {
      useState('pageTitle', 'My Page')
      const map = store.getStore()!
      expect(map.size).toBe(1)
      expect((map.get('pageTitle') as { value: unknown }).value).toBe('My Page')
    })
  })

  it('serialization mirrors entry-server-template: Object.fromEntries v.value', () => {
    store.run(new Map(), () => {
      useState('title', 'About Us')
      useState('count', 7)
      const map = store.getStore()!
      // Mirror the exact serialization in entry-server-template.ts:
      //   for (const [k, v] of _stateMap) { _stateObj[k] = v.value }
      const stateObj: Record<string, unknown> = {}
      for (const [k, v] of map) { stateObj[k] = (v as { value: unknown }).value }
      expect(stateObj).toEqual({ title: 'About Us', count: 7 })
    })
  })

  it('mutation via .value is reflected in the serialized output', () => {
    store.run(new Map(), () => {
      const ref = useState('title', 'Original')
      ref.value = 'Updated'
      const map = store.getStore()!
      expect((map.get('title') as { value: unknown }).value).toBe('Updated')
    })
  })

  it('full round-trip: SSR ALS → serialize → __CER_STATE_INIT__ → client hydration', () => {
    // 1. Server: loader sets state inside ALS context
    store.run(new Map(), () => {
      useState<string>('pageTitle').value = 'Page Title from Loader'
      useState<number>('visitCount', 42)

      // 2. Server: serialize the ALS Map (mirrors entry-server-template logic)
      const map = store.getStore()!
      const stateObj: Record<string, unknown> = {}
      for (const [k, v] of map) { stateObj[k] = (v as { value: unknown }).value }

      // Verify serialized shape is correct before handing it to the client
      expect(stateObj).toEqual({ pageTitle: 'Page Title from Loader', visitCount: 42 })

      // 3. Server injects window.__CER_STATE_INIT__ = JSON.parse(JSON.stringify(stateObj))
      //    (JSON round-trip ensures only serializable values survive, as in the real path)
      g['__CER_STATE_INIT__'] = JSON.parse(JSON.stringify(stateObj))
    })

    // 4. Client: ALS store is gone; useState() falls through to client path
    delete g['__CER_STATE_STORE__']

    // 5. Client: first useState() call creates Map from __CER_STATE_INIT__ snapshot
    const title = useState<string>('pageTitle')
    const count = useState<number>('visitCount')

    expect(title.value).toBe('Page Title from Loader')
    expect(count.value).toBe(42)

    // 6. Both callers share the same ref (same key → same ref identity)
    expect(title).toBe(useState<string>('pageTitle'))
  })
})

// ─── Generic types ────────────────────────────────────────────────────────────

describe('useState() — generic type inference', () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it('preserves generic type T', () => {
    interface User { id: number; name: string }
    const user = useState<User>('user', { id: 1, name: 'Alice' })
    expect(user.value.id).toBe(1)
    expect(user.value.name).toBe('Alice')
  })
})
