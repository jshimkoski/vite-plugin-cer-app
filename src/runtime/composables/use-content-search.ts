import {
  createComposable,
  getCurrentComponentContext,
  ref,
  useOnConnected,
  useOnDisconnected,
  watch,
} from '@jasonshimmy/custom-elements-runtime'
import type { ReactiveState } from '@jasonshimmy/custom-elements-runtime'
import type { ContentSearchResult } from '../../types/content.js'
import { contentSearchIndexUrl } from '../content/client.js'

// ─── Module-level singleton ───────────────────────────────────────────────────

// The MiniSearch instance is built lazily on first search from the manifest.
// The same promise is reused across all mounted instances so we only build once.
let _indexPromise: Promise<unknown> | null = null

/**
 * Lazily loads the MiniSearch index from `/_content/search-index.json`.
 * Returns the same Promise on repeated calls — the index is built at most once
 * per session regardless of how many search components are mounted.
 *
 * If the fetch fails the singleton is cleared so the next search attempt
 * retries automatically (no page reload required after a transient error).
 *
 * @internal Exported for unit testing only.
 */
export function loadIndex(): Promise<unknown> {
  if (_indexPromise) return _indexPromise
  const attempt = (async () => {
    const [{ default: MiniSearch }, raw] = await Promise.all([
      import('minisearch'),
      fetch(contentSearchIndexUrl()).then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch search index: ${r.status}`)
        return r.text()
      }),
    ])
    return MiniSearch.loadJSON(raw, {
      fields: ['title', 'description'],
      storeFields: ['_path', 'title', 'description'],
      idField: '_path',
    })
  })()
  _indexPromise = attempt
  // Clear the singleton on failure so the next call retries the fetch.
  // The === guard ensures a newer concurrent attempt is not accidentally cleared.
  attempt.catch(() => {
    if (_indexPromise === attempt) _indexPromise = null
  })
  return attempt
}

/** Resets the module-level singleton. Used in tests only. @internal */
export function resetIndexSingleton(): void {
  _indexPromise = null
}

// ─── Per-component debounce state ────────────────────────────────────────────

// Stores the debounce timer handle and stale-seq counter directly on the
// component context object (non-enumerable, same pattern the runtime uses for
// _hookCallbacks). This makes the values stable across re-renders — the context
// object is fixed for the lifetime of the element instance — without leaking
// into the reactive proxy or triggering spurious updates.

interface DebounceState {
  seq: number
  timer: ReturnType<typeof setTimeout> | null
}

const _STATE_KEY = '_cerSearchDebounce'

function getDebounceState(ctx: Record<string, unknown>): DebounceState {
  if (!Object.prototype.hasOwnProperty.call(ctx, _STATE_KEY)) {
    Object.defineProperty(ctx, _STATE_KEY, {
      value: { seq: 0, timer: null } as DebounceState,
      writable: false,    // object ref is fixed; its properties are still mutable
      enumerable: false,  // invisible to the reactive proxy set-trap
      configurable: false,
    })
  }
  return (ctx as Record<string, DebounceState>)[_STATE_KEY]
}

// ─── Composable ───────────────────────────────────────────────────────────────

export interface UseContentSearchReturn {
  query: ReactiveState<string>
  results: ReactiveState<ContentSearchResult[]>
  /** `true` from the moment the user starts typing until results (or an error) arrive. `false` when the query is empty or the search is complete. */
  loading: ReactiveState<boolean>
}

const _factory = createComposable((): UseContentSearchReturn => {
  const query = ref('')
  const results = ref<ContentSearchResult[]>([])
  const loading = ref(false)

  // Debounce state lives on the component context, not in local render-body variables.
  // Local variables are re-created on every re-render; the context object is stable
  // for the lifetime of the element.  Storing state here lets the render-body
  // watch() (see below) pick up the same timer and sequence counter across re-renders
  // without the watcher accumulation that occurs when watch() is placed inside
  // useOnConnected() (which runs once per mount but is not registered for cleanup
  // by the reactive system, leaking watchers on every disconnect + reconnect cycle).
  const state = getDebounceState(getCurrentComponentContext()! as Record<string, unknown>)

  // Pre-warm the index on first mount so the first real search is faster.
  useOnConnected(() => {
    loadIndex().catch(() => {/* silently ignore pre-warm errors */})
  })

  // Cancel any in-flight debounce on unmount so stale async work doesn't land
  // after the component is gone.
  useOnDisconnected(() => {
    if (state.timer !== null) {
      clearTimeout(state.timer)
      state.timer = null
    }
    state.seq++ // discard any in-flight async search
    loading.value = false
  })

  // watch() is in the render body so the reactive system registers it under the
  // current component and tears it down automatically on re-render and disconnect.
  // The mutable state (seq / timer) lives on the context (above) and persists
  // across re-renders — new watcher instances see the same timer and counter,
  // which is what makes debounce cancellation correct even after a re-render.
  watch(query, (q: string) => {
    if (state.timer !== null) {
      clearTimeout(state.timer)
      state.timer = null
    }

    if (!q) {
      // Increment seq so any in-flight async search is discarded when it resolves
      state.seq++
      loading.value = false
      results.value = []
      return
    }

    // Signal loading immediately so the UI can respond before the debounce fires
    loading.value = true

    state.timer = setTimeout(async () => {
      state.timer = null
      const seq = ++state.seq

      try {
        const index = await loadIndex() as { search(q: string, opts?: { prefix?: boolean }): ContentSearchResult[] }
        if (seq !== state.seq) return // stale — a newer query is in flight
        results.value = index.search(q, { prefix: true }) as ContentSearchResult[]
      } catch {
        if (seq !== state.seq) return
        results.value = []
      } finally {
        // Only clear loading for the most recent search; a newer in-flight search
        // keeps loading=true until it settles.
        if (seq === state.seq) loading.value = false
      }
    }, 200)
  })

  return { query, results, loading }
})

/**
 * Full-text content search composable.
 *
 * Loads a pre-built MiniSearch index lazily on first use by fetching
 * `/_content/search-index.json`. Both MiniSearch and the index are loaded via
 * dynamic import — neither is in the app bundle.
 *
 * Searches `title` and `description` fields. Input is debounced (200 ms) so
 * the index is not queried on every keystroke. `loading` becomes `true` as soon
 * as the user starts typing and returns to `false` once results arrive. Results
 * are empty when the query is empty.
 *
 * **SSR note**: search is always client-side. In SSR mode the component renders
 * with empty results and hydrates on mount.
 *
 * @example
 * ```ts
 * component('site-search', () => {
 *   const { query, results, loading } = useContentSearch()
 *
 *   return html`
 *     <input type="search" :model="${query}" placeholder="Search…" />
 *     ${loading.value ? html`<p>Searching…</p>` : ''}
 *     ${when(results.value.length > 0, () => html`
 *       <ul>
 *         ${each(results.value, r => html`
 *           <li><a :href="${r._path}">${r.title}</a></li>
 *         `)}
 *       </ul>
 *     `)}
 *   `
 * })
 * ```
 */
export function useContentSearch(): UseContentSearchReturn {
  return _factory()
}
