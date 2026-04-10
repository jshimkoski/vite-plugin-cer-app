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
}

const _factory = createComposable((): UseContentSearchReturn => {
  const query = ref('')
  const results = ref<ContentSearchResult[]>([])

  // Pre-warm index on mount
  useOnConnected(() => {
    loadIndex().catch(() => {/* silently ignore pre-warm errors */})
  })

  // Monotonic counter to discard stale async results
  let _seq = 0

  watch(query, async (q: string) => {
    const seq = ++_seq

    if (!q || q.length < 2) {
      results.value = []
      return
    }

    try {
      const index = await loadIndex() as { search(q: string, opts?: { prefix?: boolean }): ContentSearchResult[] }
      if (seq !== _seq) return // stale — a newer query is in flight
      results.value = index.search(q, { prefix: true }) as ContentSearchResult[]
    } catch {
      if (seq !== _seq) return
      results.value = []
    }
  })

  return { query, results }
})

/**
 * Full-text content search composable.
 *
 * Loads a pre-built MiniSearch index lazily on first use by fetching
 * `/_content/search-index.json`. Both MiniSearch and the index are loaded via
 * dynamic import — neither is in the app bundle.
 *
 * Searches `title` and `description` fields. Results are empty until at least
 * 2 characters are entered.
 *
 * **SSR note**: search is always client-side. In SSR mode the component renders
 * with empty results and hydrates on mount.
 *
 * @example
 * ```ts
 * component('site-search', () => {
 *   const { query, results } = useContentSearch()
 *
 *   return html`
 *     <input type="search" :model="${query}" placeholder="Search…" />
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
