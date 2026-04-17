import {
  createComposable,
  ref,
  useOnConnected,
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
 * @internal Exported for unit testing only.
 */
export async function loadIndex(): Promise<unknown> {
  if (_indexPromise) return _indexPromise
  _indexPromise = (async () => {
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
  return _indexPromise
}

/** Resets the module-level singleton. Used in tests only. @internal */
export function resetIndexSingleton(): void {
  _indexPromise = null
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

  // Pre-warm index on mount
  useOnConnected(() => {
    loadIndex().catch(() => {/* silently ignore pre-warm errors */})
  })

  // Monotonic counter to discard stale async results
  let _seq = 0
  let _debounceTimer: ReturnType<typeof setTimeout> | null = null

  watch(query, (q: string) => {
    if (_debounceTimer !== null) {
      clearTimeout(_debounceTimer)
      _debounceTimer = null
    }

    if (!q) {
      // Increment seq so any in-flight async search is discarded when it resolves
      _seq++
      loading.value = false
      results.value = []
      return
    }

    // Signal loading immediately so the UI can respond before the debounce fires
    loading.value = true

    _debounceTimer = setTimeout(async () => {
      _debounceTimer = null
      const seq = ++_seq

      try {
        const index = await loadIndex() as { search(q: string, opts?: { prefix?: boolean }): ContentSearchResult[] }
        if (seq !== _seq) return // stale — a newer query is in flight
        results.value = index.search(q, { prefix: true }) as ContentSearchResult[]
      } catch {
        if (seq !== _seq) return
        results.value = []
      } finally {
        // Only clear loading for the most recent search; a newer in-flight search
        // keeps loading=true until it settles.
        if (seq === _seq) loading.value = false
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
