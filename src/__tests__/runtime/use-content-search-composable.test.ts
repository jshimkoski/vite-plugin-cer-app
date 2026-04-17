/**
 * Tests for the useContentSearch() composable.
 *
 * Covers:
 * - Initial state — empty query, empty results, loading=false
 * - loading state — true immediately on typing, false after results arrive
 * - Debounce timing — results are withheld until 200 ms after the last keystroke
 * - Timer cancellation — a new query before 200 ms resets the debounce clock
 * - Empty-query path — clears loading + results immediately, cancels pending timer
 * - Disconnect cleanup — pending timer is cancelled and loading reset on unmount
 * - Results content — correct items returned for each query
 *
 * @jasonshimmy/custom-elements-runtime is mocked so these tests run without a
 * real DOM or component context. The watch() callback is available immediately
 * after useContentSearch() is called (it is registered during the render-body
 * call, not inside useOnConnected), so no triggerConnected() is needed before
 * simulateType().
 *
 * Note: verifying that debounced input triggers exactly one loadIndex() call
 * is an end-to-end concern exercised in content.cy.ts — the seq-stale guard
 * discards duplicate search results even when debounce is absent, making the
 * count indistinguishable at the unit level.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildSearchIndex } from '../../plugin/content/search.js'
import type { ContentItem } from '../../types/content.js'

// ─── Sample content ───────────────────────────────────────────────────────────

const ITEMS: ContentItem[] = [
  {
    _path: '/blog/hello',
    _file: 'blog/hello.md',
    _type: 'markdown',
    title: 'Hello World',
    description: 'A post about hello',
    body: '<p>Hello</p>',
    toc: [],
  },
  {
    _path: '/docs/start',
    _file: 'docs/start.md',
    _type: 'markdown',
    title: 'Getting Started',
    description: 'How to get started',
    body: '<p>Start</p>',
    toc: [],
  },
]

// ─── Runtime mock ─────────────────────────────────────────────────────────────
//
// The mock simulates just enough of the runtime for these unit tests:
//   _currentMockContext    — fresh plain object each test; receives _cerSearchDebounce
//   _connectedCallbacks    — useOnConnected callbacks (pre-warm only in new implementation)
//   _disconnectedCallbacks — useOnDisconnected callbacks (timer cleanup)
//   _watchCallback         — the single watch(query, cb) handler registered during render

let _currentMockContext: Record<string, unknown> = {}
let _connectedCallbacks: Array<() => void> = []
let _disconnectedCallbacks: Array<() => void> = []
let _watchCallback: ((q: string) => void) | null = null

vi.mock('@jasonshimmy/custom-elements-runtime', () => ({
  // Run the factory immediately; getCurrentComponentContext() returns the mock context.
  createComposable: (fn: () => unknown) => () => fn(),
  // Minimal reactive ref: plain object with getter/setter.
  ref: (initial: unknown) => {
    let _val = initial
    return {
      get value() { return _val },
      set value(v: unknown) { _val = v },
    }
  },
  // Capture the single watch() callback registered by the composable.
  watch: (_state: unknown, cb: (val: string) => void) => {
    _watchCallback = cb
  },
  // Capture useOnConnected callbacks for manual triggering (pre-warm only).
  useOnConnected: (cb: () => void) => {
    _connectedCallbacks.push(cb)
  },
  // Capture useOnDisconnected callbacks for manual triggering.
  useOnDisconnected: (cb: () => void) => {
    _disconnectedCallbacks.push(cb)
  },
  // Return the fresh mock context so getDebounceState() can attach _cerSearchDebounce.
  getCurrentComponentContext: () => _currentMockContext,
}))

// Static imports resolve AFTER vi.mock hoisting, so the mock is in place when
// use-content-search.js's module-level createComposable() call executes.
import { useContentSearch, resetIndexSingleton } from '../../runtime/composables/use-content-search.js'
import type { UseContentSearchReturn } from '../../runtime/composables/use-content-search.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Flush all useOnConnected callbacks (simulates component mount). */
function triggerConnected(): void {
  for (const cb of _connectedCallbacks) cb()
}

/** Flush all useOnDisconnected callbacks (simulates component unmount). */
function triggerDisconnected(): void {
  for (const cb of _disconnectedCallbacks) cb()
}

/** Simulate the user typing a value into the search input. */
function simulateType(q: string): void {
  if (!_watchCallback) throw new Error('watch callback not registered — did you call useContentSearch()?')
  _watchCallback(q)
}

// Convenience typed accessor
type Ref<T> = { value: T }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useContentSearch() composable', () => {
  let result: UseContentSearchReturn
  let originalFetch: typeof globalThis.fetch

  beforeEach(async () => {
    // Fresh context object for each test so _cerSearchDebounce doesn't bleed
    _currentMockContext = {}
    _connectedCallbacks = []
    _disconnectedCallbacks = []
    _watchCallback = null

    // Each test gets a fresh index singleton so loadIndex() re-fetches.
    resetIndexSingleton()

    originalFetch = globalThis.fetch
    const indexJson = buildSearchIndex(ITEMS)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(indexJson),
    } as unknown as Response)

    // Calling useContentSearch() runs the factory, which calls watch() and
    // registers useOnConnected/useOnDisconnected callbacks synchronously.
    result = useContentSearch()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  // ─── Shape ─────────────────────────────────────────────────────────────────

  it('returns query, results, and loading refs', () => {
    expect(result).toHaveProperty('query')
    expect(result).toHaveProperty('results')
    expect(result).toHaveProperty('loading')
  })

  it('initialises with empty query, empty results, and loading=false', () => {
    expect((result.query as Ref<string>).value).toBe('')
    expect((result.results as Ref<unknown[]>).value).toEqual([])
    expect((result.loading as Ref<boolean>).value).toBe(false)
  })

  it('registers a watch callback during the render call (not after mount)', () => {
    // The watch() is in the render body: available immediately after useContentSearch()
    expect(_watchCallback).not.toBeNull()
  })

  it('attaches _cerSearchDebounce to the component context', () => {
    expect(_currentMockContext).toHaveProperty('_cerSearchDebounce')
    const state = _currentMockContext['_cerSearchDebounce'] as { seq: number; timer: unknown }
    expect(state.seq).toBe(0)
    expect(state.timer).toBeNull()
  })

  it('registers a useOnDisconnected callback for timer cleanup', () => {
    expect(_disconnectedCallbacks).toHaveLength(1)
  })

  // ─── loading state ─────────────────────────────────────────────────────────

  it('sets loading=true immediately when a non-empty query is set', () => {
    vi.useFakeTimers()
    simulateType('Hello')
    expect((result.loading as Ref<boolean>).value).toBe(true)
  })

  it('keeps loading=true while the debounce timer is pending', () => {
    vi.useFakeTimers()
    simulateType('Hello')
    vi.advanceTimersByTime(100) // 100 ms < 200 ms debounce
    expect((result.loading as Ref<boolean>).value).toBe(true)
    expect((result.results as Ref<unknown[]>).value).toEqual([])
  })

  it('sets loading=false once results arrive after the debounce window', async () => {
    vi.useFakeTimers()
    simulateType('Hello')
    await vi.runAllTimersAsync()
    expect((result.loading as Ref<boolean>).value).toBe(false)
  })

  it('clears loading immediately when query is reset to empty string', () => {
    vi.useFakeTimers()
    simulateType('Hello')
    expect((result.loading as Ref<boolean>).value).toBe(true)
    simulateType('')
    expect((result.loading as Ref<boolean>).value).toBe(false)
  })

  // ─── Debounce timing ───────────────────────────────────────────────────────

  it('withholds results until 200 ms after the last keystroke', () => {
    vi.useFakeTimers()
    simulateType('Hello')
    vi.advanceTimersByTime(199) // 1 ms before debounce fires
    expect((result.results as Ref<unknown[]>).value).toEqual([])
  })

  it('delivers results after the 200 ms debounce window elapses', async () => {
    vi.useFakeTimers()
    simulateType('Hello')
    await vi.runAllTimersAsync()
    expect((result.results as Ref<unknown[]>).value.length).toBeGreaterThan(0)
  })

  it('resets the debounce clock when a new query arrives before 200 ms', async () => {
    vi.useFakeTimers()

    simulateType('Getting')       // timer-A starts at t=0
    vi.advanceTimersByTime(100)   // t=100 — timer-A still pending (100 < 200)
    simulateType('Hello')         // cancels timer-A, timer-B starts at t=100
    vi.advanceTimersByTime(100)   // t=200 — only 100 ms since timer-B started; still pending

    // No results yet — timer-B hasn't fired
    expect((result.results as Ref<unknown[]>).value).toEqual([])

    await vi.runAllTimersAsync()  // timer-B fires at t=300; search runs with 'Hello'

    const paths = (result.results as Ref<{ _path: string }[]>).value.map(r => r._path)
    expect(paths).toContain('/blog/hello')       // 'Hello' prefix matched Hello World
    expect(paths).not.toContain('/docs/start')   // 'Getting' timer was cancelled
  })

  it('cancels the pending timer and prevents results when query is cleared mid-debounce', async () => {
    vi.useFakeTimers()
    simulateType('Hello')         // debounce timer starts
    vi.advanceTimersByTime(100)   // partway through window
    simulateType('')              // clears timer; loading + results reset immediately

    expect((result.loading as Ref<boolean>).value).toBe(false)
    expect((result.results as Ref<unknown[]>).value).toEqual([])

    await vi.runAllTimersAsync()  // advance remaining time — no timer should fire
    expect((result.results as Ref<unknown[]>).value).toEqual([]) // still empty
  })

  // ─── Disconnect cleanup ────────────────────────────────────────────────────

  it('cancels the pending timer on disconnect', async () => {
    vi.useFakeTimers()
    simulateType('Hello')
    vi.advanceTimersByTime(100) // timer is pending

    triggerDisconnected()

    // Timer should be cancelled — advancing past the debounce window produces no results
    await vi.runAllTimersAsync()
    expect((result.results as Ref<unknown[]>).value).toEqual([])
  })

  it('resets loading to false on disconnect', () => {
    vi.useFakeTimers()
    simulateType('Hello')
    expect((result.loading as Ref<boolean>).value).toBe(true)

    triggerDisconnected()
    expect((result.loading as Ref<boolean>).value).toBe(false)
  })

  // ─── Result shape and content ──────────────────────────────────────────────

  it('result items include _path and title', async () => {
    vi.useFakeTimers()
    simulateType('Hello')
    await vi.runAllTimersAsync()
    const first = (result.results as Ref<Record<string, unknown>[]>).value[0]
    expect(first).toHaveProperty('_path')
    expect(first).toHaveProperty('title')
  })

  it('searching "Hello" returns Hello World and not Getting Started', async () => {
    vi.useFakeTimers()
    simulateType('Hello')
    await vi.runAllTimersAsync()
    const paths = (result.results as Ref<{ _path: string }[]>).value.map(r => r._path)
    expect(paths).toContain('/blog/hello')
    expect(paths).not.toContain('/docs/start')
  })

  it('searching "Getting" returns Getting Started and not Hello World', async () => {
    vi.useFakeTimers()
    simulateType('Getting')
    await vi.runAllTimersAsync()
    const paths = (result.results as Ref<{ _path: string }[]>).value.map(r => r._path)
    expect(paths).toContain('/docs/start')
    expect(paths).not.toContain('/blog/hello')
  })

  it('clears results immediately when query is reset from non-empty to empty', async () => {
    vi.useFakeTimers()
    simulateType('Hello')
    await vi.runAllTimersAsync()
    expect((result.results as Ref<unknown[]>).value.length).toBeGreaterThan(0)

    simulateType('')
    expect((result.results as Ref<unknown[]>).value).toEqual([])
  })

  // ─── Pre-warm ──────────────────────────────────────────────────────────────

  it('registers a useOnConnected callback for index pre-warming', () => {
    expect(_connectedCallbacks).toHaveLength(1)
  })

  it('pre-warms the index on mount (triggers a fetch)', async () => {
    triggerConnected()
    // fetch is called by the pre-warm (loadIndex inside useOnConnected)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  // ─── Re-render stability ───────────────────────────────────────────────────
  //
  // The core fix: _seq and _timer live on the component context, not in local
  // factory-body variables. These tests confirm that calling the factory a second
  // time (simulating a component re-render) reuses the same state object rather
  // than resetting it, so a timer set during one render can be cancelled by the
  // new watcher registered on the next render.

  it('reuses the same debounce state object when the factory runs again with the same context', () => {
    // First render already called useContentSearch() in beforeEach.
    const state1 = _currentMockContext['_cerSearchDebounce']
    expect(state1).toBeDefined()

    // Simulate re-render: reset captured callbacks, call factory again.
    _connectedCallbacks = []
    _disconnectedCallbacks = []
    _watchCallback = null
    useContentSearch()

    const state2 = _currentMockContext['_cerSearchDebounce']

    // Must be the identical object — not re-created.
    expect(state2).toBe(state1)
  })

  it('a new keystroke after re-render cancels the timer that was set in the previous render', () => {
    vi.useFakeTimers()

    // First render (done in beforeEach). Type something → timer-A starts.
    simulateType('Getting')
    const state = _currentMockContext['_cerSearchDebounce'] as {
      timer: ReturnType<typeof setTimeout> | null
      seq: number
    }
    const timerA = state.timer
    expect(timerA).not.toBeNull()

    // Simulate re-render: new watch callback registered, same context state.
    _watchCallback = null
    useContentSearch()

    // The new watcher fires. It reads state.timer (still timerA) and cancels it,
    // then starts timer-B.
    simulateType('Hello')

    expect(state.timer).not.toBeNull()
    expect(state.timer).not.toBe(timerA) // timer-A was replaced by timer-B
  })

  it('seq counter is not reset to 0 when the factory runs again (shared state)', async () => {
    vi.useFakeTimers()

    // First render: type something, let the debounce fire.
    simulateType('Getting')
    await vi.runAllTimersAsync() // timer fires → seq incremented to 1

    const state = _currentMockContext['_cerSearchDebounce'] as { seq: number }
    expect(state.seq).toBe(1)

    // Simulate re-render: fresh callbacks, same context.
    _connectedCallbacks = []
    _disconnectedCallbacks = []
    _watchCallback = null
    useContentSearch()

    // Type again on the new watcher and let it fire.
    simulateType('Hello')
    await vi.runAllTimersAsync() // seq incremented to 2

    // If state were re-initialised on re-render, seq would be 1 again.
    // Shared state means it continues from where it left off.
    expect(state.seq).toBe(2)
  })
})
