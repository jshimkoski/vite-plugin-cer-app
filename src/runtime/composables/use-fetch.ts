/**
 * useFetch — isomorphic data fetching composable.
 *
 * Behaves differently based on the calling context:
 *
 * **Component context** (inside a `component()` render function):
 * Uses `createComposable` internally so that `useOnConnected` is bound to the
 * calling component's lifecycle.  Returns reactive `ReactiveState` refs for
 * `data`, `pending`, and `error` — the component re-renders automatically
 * when the fetch settles.  The fetch is triggered by `useOnConnected` (i.e.
 * when the component mounts), unless `lazy: true` / `server: false`.
 *
 * **Loader / SSR context** (inside an async `load()` or middleware):
 * Returns a *thenable* `UseFetchResult` — you can `await useFetch(...)` to
 * block SSR rendering until data is ready.  The result is serialised into
 * `window.__CER_FETCH_DATA__` for client hydration.
 *
 * @example
 * ```ts
 * // app/pages/posts.ts — loader context (SSR + client navigation)
 * export const loader = async () => {
 *   const { data: posts } = await useFetch<Post[]>('/api/posts')
 *   return { posts }
 * }
 * ```
 *
 * @example
 * ```ts
 * // Inside a component — reactive, auto-fetches on mount
 * component('post-list', () => {
 *   const { data: posts, pending, error } = useFetch<Post[]>('/api/posts')
 *
 *   return html`
 *     ${pending.value ? html`<p>Loading…</p>` : ''}
 *     ${error.value ? html`<p>Error: ${error.value.message}</p>` : ''}
 *     ${posts.value?.map(p => html`<li>${p.title}</li>`)}
 *   `
 * })
 * ```
 *
 * @example
 * ```ts
 * // Lazy — skip auto-fetch, call refresh() manually
 * component('post-list', () => {
 *   const { data: posts, refresh } = useFetch<Post[]>('/api/posts', { lazy: true })
 *
 *   useOnConnected(async () => {
 *     await refresh()
 *   })
 * })
 * ```
 */

import { createComposable, getCurrentComponentContext, ref, useOnConnected } from '@jasonshimmy/custom-elements-runtime'
import type { ReactiveState } from '@jasonshimmy/custom-elements-runtime'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Return value when `useFetch` is called inside a component render function.
 * All fields are reactive (`ReactiveState`) — the component re-renders
 * automatically when the fetch settles or `refresh()` is called.
 */
export interface UseFetchReactiveReturn<T = unknown> {
  /** Reactive fetch result.  Access via `.data.value`. */
  data: ReactiveState<T | null>
  /** `true` while the request is in-flight. */
  pending: ReactiveState<boolean>
  /** Set when the request fails; `null` on success. */
  error: ReactiveState<Error | null>
  /** Re-issues the fetch and updates `data`, `pending`, and `error`. */
  refresh(): Promise<void>
}

/** Options for `useFetch()`. Controls caching, SSR behaviour, data transformation, and HTTP request details. */
export interface UseFetchOptions<T = unknown> {
  /**
   * Unique cache key.  Defaults to the full URL string (including query params).
   *
   * On the server, calls sharing the same key within one request reuse the
   * first result without issuing a second network request.  On the client,
   * the key is used to consume the hydrated `window.__CER_FETCH_DATA__` entry
   * exactly once — subsequent calls with the same key issue a fresh fetch.
   */
  key?: string
  /**
   * When `true`, skip the SSR fetch entirely and only fetch on the client.
   * Equivalent to `server: false`.
   *
   * In component context this also skips the `useOnConnected` auto-fetch —
   * call `refresh()` manually when you want the request to fire.
   */
  lazy?: boolean
  /**
   * When `false`, equivalent to `lazy: true` — skip SSR, fetch client-side.
   */
  server?: boolean
  /**
   * Factory that returns the initial value before the fetch completes.
   * Called once per `useFetch()` invocation.  Defaults to `() => null`.
   *
   * @example `{ default: () => [] }` — start with an empty array
   */
  default?: () => T
  /**
   * Transform the raw JSON response before storing / returning it.
   * Applied after `pick` (if both are set).
   */
  transform?: (data: unknown) => T
  /**
   * Pick a subset of keys from an object response.
   * Applied before `transform`.  Keys absent in the response become
   * `undefined` in the result.
   */
  pick?: string[]
  /** HTTP method.  Defaults to `'GET'`. */
  method?: string
  /**
   * Request body for POST / PUT / PATCH.  Serialised to JSON automatically;
   * sets `Content-Type: application/json` if not already provided.
   */
  body?: unknown
  /** Additional request headers merged with auto-generated ones. */
  headers?: Record<string, string>
  /**
   * Query parameters appended to the URL via `URLSearchParams`.
   * Included in the default cache `key`.
   */
  query?: Record<string, string>
}

export interface UseFetchReturn<T = unknown> {
  data: T | null
  pending: boolean
  error: Error | null
  /** Re-issues the fetch and updates `data`, `pending`, and `error` in place. */
  refresh(): Promise<UseFetchReturn<T>>
}

/** A UseFetchReturn that is also awaitable (resolves once the fetch completes). */
export type UseFetchResult<T = unknown> = UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>

// ─── Client-side in-flight deduplication ─────────────────────────────────────
// P2-3: When two components (or two concurrent refresh() calls) fetch the same
// key simultaneously, only one HTTP request is issued. The second caller awaits
// the shared Promise and applies its own transform to the raw response.
// The map is module-level so all component instances share it.
// Keys are removed when the Promise settles (resolve or reject).
const _inflight = new Map<string, Promise<unknown>>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Access fetch via globalThis so that vi.stubGlobal('fetch', mock) works in tests.
// A direct `fetch(...)` call in an ESM module may bind to the runtime's fetch
// at module-evaluation time and bypass globalThis mutations.
function _fetch(url: string, init?: RequestInit): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((globalThis as any)['fetch'] as typeof fetch)(url, init)
}

function applyPick(data: unknown, pick: string[]): unknown {
  if (typeof data !== 'object' || data === null) return data
  return Object.fromEntries(pick.map((k) => [k, (data as Record<string, unknown>)[k]]))
}

function applyTransform<T>(raw: unknown, options?: UseFetchOptions<T>): T {
  let result = raw
  if (options?.pick) result = applyPick(result, options.pick)
  if (options?.transform) result = options.transform(result)
  return result as T
}

function buildInit(options?: UseFetchOptions): RequestInit {
  const init: RequestInit = { method: options?.method ?? 'GET' }
  const headers: Record<string, string> = { ...options?.headers }
  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body)
    headers['Content-Type'] = 'application/json'
  }
  if (Object.keys(headers).length > 0) init.headers = headers
  return init
}

function appendQuery(url: string, query?: Record<string, string>): string {
  if (!query || Object.keys(query).length === 0) return url
  const sep = url.includes('?') ? '&' : '?'
  return url + sep + new URLSearchParams(query).toString()
}

function makeResult<T>(
  state: UseFetchReturn<T>,
  settling: Promise<void> | null,
): UseFetchResult<T> {
  // Return a wrapper with live getters so callers see state mutations (e.g.
  // after doClientFetch sets state.data), PLUS a custom .then so the result
  // is directly awaitable.
  //
  // Critically, we do NOT add .then to `state` itself — doing so would cause
  // async functions that `return state` (e.g. doClientFetch) to deadlock:
  // the async function's Promise would try to assimilate state as a thenable,
  // calling state.then which waits for settling, which can't resolve until
  // the async function finishes — a circular dependency.
  return {
    get data() { return state.data },
    get pending() { return state.pending },
    get error() { return state.error },
    get refresh() { return state.refresh },
    then(
      onFulfilled?: (v: UseFetchReturn<T>) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) {
      const p = settling ?? Promise.resolve()
      // Remove .then from this wrapper BEFORE resolving so the Promise
      // machinery won't treat it as a thenable when resolve(this) is called.
      // After deletion the wrapper becomes a plain UseFetchReturn<T> with
      // live getters — callers can still read .data, .error, etc. and get
      // up-to-date values (e.g. after .refresh()).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (this as any).then
      const self = this as UseFetchReturn<T>
      return p.then(() => {
        if (onFulfilled) return onFulfilled(self)
      }, onRejected)
    },
  } as UseFetchResult<T>
}

// ─── Component-context composable factory ─────────────────────────────────────

/**
 * Called when `useFetch` detects it is running inside a component render
 * function.  The factory is created fresh per call so each component instance
 * gets isolated reactive state; `createComposable` binds lifecycle hooks
 * (`useOnConnected`) to the calling component.
 */
function makeComponentFetch<T>(
  url: string | (() => string),
  options: UseFetchOptions<T> | undefined,
  ctx: Record<string, unknown>,
): UseFetchReactiveReturn<T> {
  const factory = createComposable((): UseFetchReactiveReturn<T> => {
    const isLazy = options?.lazy === true || options?.server === false
    const resolvedUrl = appendQuery(
      typeof url === 'function' ? url() : url,
      options?.query,
    )

    const data = ref<T | null>(options?.default ? options.default() : null)
    const pending = ref(false)
    const error = ref<Error | null>(null)

    const doFetch = async (): Promise<void> => {
      pending.value = true
      error.value = null
      try {
        const res = await _fetch(resolvedUrl, buildInit(options))
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
        const raw = await res.json()
        data.value = applyTransform<T>(raw, options)
      } catch (err) {
        error.value = err instanceof Error ? err : new Error(String(err))
      } finally {
        pending.value = false
      }
    }

    if (!isLazy) {
      useOnConnected(doFetch)
    }

    return { data, pending, error, refresh: doFetch }
  })

  return factory(ctx)
}

// ─── Core implementation ──────────────────────────────────────────────────────

/**
 * Isomorphic data fetching composable.
 *
 * - **Inside a `component()` render function**: returns reactive
 *   {@link UseFetchReactiveReturn} — `data`, `pending`, and `error` are
 *   `ReactiveState` refs that trigger re-renders automatically.  The fetch
 *   fires via `useOnConnected` unless `lazy: true`.
 * - **Inside a loader / SSR context**: returns a thenable
 *   {@link UseFetchResult} — `await useFetch(...)` blocks rendering until data
 *   is ready.
 */
export function useFetch<T = unknown>(
  url: string | (() => string),
  options?: UseFetchOptions<T>,
): UseFetchResult<T> | UseFetchReactiveReturn<T> {
  // ── Component context ───────────────────────────────────────────────────────
  // When called inside a component render function, use createComposable so
  // that useOnConnected is bound to the calling component's lifecycle and
  // state is isolated per component instance.
  const componentCtx = getCurrentComponentContext()
  if (componentCtx) {
    return makeComponentFetch(url, options, componentCtx)
  }
  const g = globalThis as Record<string, unknown>
  const resolvedUrl = appendQuery(
    typeof url === 'function' ? url() : url,
    options?.query,
  )
  const key = options?.key ?? resolvedUrl
  const isLazy = options?.lazy === true || options?.server === false
  const defaultValue = (options?.default ? options.default() : null) as T | null

  // ── Server path ─────────────────────────────────────────────────────────────
  // __CER_FETCH_STORE__ is only present in Node.js (tree-shaken from client bundle).
  const fetchStoreAls = g['__CER_FETCH_STORE__'] as { getStore(): unknown } | undefined
  if (fetchStoreAls) {
    const fetchMap = fetchStoreAls.getStore() as Map<string, unknown> | null

    if (fetchMap) {
      // Already fetched in this request — return cached result synchronously.
      if (fetchMap.has(key)) {
        const state: UseFetchReturn<T> = {
          data: applyTransform(fetchMap.get(key), options),
          pending: false,
          error: null,
          refresh: async () => state,
        }
        return makeResult(state, null)
      }

      if (isLazy) {
        const state: UseFetchReturn<T> = {
          data: defaultValue,
          pending: false,
          error: null,
          refresh: async () => state,
        }
        return makeResult(state, null)
      }

      // Perform the SSR fetch.
      const state: UseFetchReturn<T> = {
        data: defaultValue,
        pending: true,
        error: null,
        refresh: async () => state,
      }

      const settling = (async () => {
        try {
          const res = await _fetch(resolvedUrl, buildInit(options))
          if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
          const raw = await res.json()
          const transformed = applyTransform<T>(raw, options)
          // Store in per-request map so the same key isn't fetched twice.
          fetchMap.set(key, transformed)
          // Also write to the flat accumulator that the entry-server serialises.
          const acc = (g['__CER_FETCH_DATA__'] ?? {}) as Record<string, unknown>
          acc[key] = transformed
          ;(g as Record<string, unknown>)['__CER_FETCH_DATA__'] = acc
          state.data = transformed
          state.pending = false
        } catch (err) {
          state.error = err instanceof Error ? err : new Error(String(err))
          state.pending = false
        }
      })()

      return makeResult(state, settling)
    }
  }

  // ── Client hydration path ───────────────────────────────────────────────────
  // Read the pre-fetched data injected by the server into window.__CER_FETCH_DATA__.
  const fetchData = g['__CER_FETCH_DATA__'] as Record<string, unknown> | undefined
  if (fetchData && key in fetchData) {
    const raw = fetchData[key]
    // Consume the key — next navigation will fetch fresh.
    delete fetchData[key]
    const hydrated = applyTransform<T>(raw, options)
    const state: UseFetchReturn<T> = {
      data: hydrated,
      pending: false,
      error: null,
      refresh: () => doClientFetch(key, resolvedUrl, options, state),
    }
    return makeResult(state, null)
  }

  // ── Client fetch ─────────────────────────────────────────────────────────────
  const state: UseFetchReturn<T> = {
    data: defaultValue,
    pending: !isLazy,
    error: null,
    refresh: async () => state,
  }
  state.refresh = () => doClientFetch(key, resolvedUrl, options, state)

  let settling: Promise<void> | null = null
  if (!isLazy) {
    settling = doClientFetch(key, resolvedUrl, options, state).then(() => undefined)
  }

  return makeResult(state, settling)
}

async function doClientFetch<T>(
  key: string,
  resolvedUrl: string,
  options: UseFetchOptions<T> | undefined,
  state: UseFetchReturn<T>,
): Promise<UseFetchReturn<T>> {
  // P2-3: Deduplicate concurrent requests for the same key.
  // If another request for this key is already in-flight, share its raw Promise.
  let rawPromise: Promise<unknown>

  if (_inflight.has(key)) {
    rawPromise = _inflight.get(key)!
  } else {
    state.pending = true
    state.error = null
    rawPromise = _fetch(resolvedUrl, buildInit(options))
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
        return res.json()
      })
      .finally(() => { _inflight.delete(key) })
    _inflight.set(key, rawPromise)
  }

  try {
    const raw = await rawPromise
    state.data = applyTransform<T>(raw, options)
    state.pending = false
  } catch (err) {
    state.error = err instanceof Error ? err : new Error(String(err))
    state.pending = false
  }
  return state
}
