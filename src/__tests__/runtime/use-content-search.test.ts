/**
 * Tests for useContentSearch helpers.
 *
 * Covers:
 * - contentSearchIndexUrl() — correct URL with and without router.base
 * - loadIndex() singleton — fetched and built only once per session
 * - loadIndex() error path — fetch failure rejects cleanly; singleton reset allows retry
 * - loadIndex() returns a searchable MiniSearch instance
 *
 * The full useContentSearch() composable (debounce, loading state, stale-seq
 * guard) is tested in use-content-search-composable.test.ts, which mocks the
 * runtime to exercise the watch callback and fake-timer debounce logic directly.
 * End-to-end behaviour is covered by content.cy.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MiniSearch from 'minisearch'
import { buildSearchIndex } from '../../plugin/content/search.js'
import type { ContentItem } from '../../types/content.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_ITEMS: ContentItem[] = [
  {
    _path: '/blog/hello',
    _file: 'blog/hello.md',
    _type: 'markdown',
    title: 'Hello World',
    description: 'First post about web components',
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

/** Builds a serialised MiniSearch index from sample items (same format as search.ts). */
function buildIndex(): string {
  return buildSearchIndex(SAMPLE_ITEMS)
}

// ─── contentSearchIndexUrl ────────────────────────────────────────────────────

describe('contentSearchIndexUrl', () => {
  it('returns a URL ending with /_content/search-index.json', async () => {
    const { contentSearchIndexUrl } = await import('../../runtime/content/client.js')
    const url = contentSearchIndexUrl()
    expect(url).toMatch(/\/_content\/search-index\.json$/)
  })
})

// ─── loadIndex singleton ──────────────────────────────────────────────────────

describe('loadIndex', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(async () => {
    originalFetch = globalThis.fetch
    // Reset the singleton before each test so tests are independent
    const { resetIndexSingleton } = await import('../../runtime/composables/use-content-search.js')
    resetIndexSingleton()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('fetches the index only once despite multiple concurrent calls (singleton)', async () => {
    const indexJson = buildIndex()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(indexJson),
    } as unknown as Response)

    const { loadIndex, resetIndexSingleton } = await import('../../runtime/composables/use-content-search.js')
    resetIndexSingleton()

    // Call loadIndex() three times concurrently — only one fetch should occur.
    const [r1, r2, r3] = await Promise.all([loadIndex(), loadIndex(), loadIndex()])
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1)
    // All calls must resolve to the same underlying index object
    expect(r1).toBe(r2)
    expect(r2).toBe(r3)
  })

  it('returns a MiniSearch-compatible index that can search by title', async () => {
    const indexJson = buildIndex()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(indexJson),
    } as unknown as Response)

    const { loadIndex, resetIndexSingleton } = await import('../../runtime/composables/use-content-search.js')
    resetIndexSingleton()

    const index = await loadIndex() as ReturnType<typeof MiniSearch.loadJSON>
    const results = index.search('Hello', { prefix: true }) as unknown as Array<{ _path: string }>
    expect(results.some((r) => r._path === '/blog/hello')).toBe(true)
  })

  it('rejects when fetch fails (non-ok status)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response)

    const { loadIndex, resetIndexSingleton } = await import('../../runtime/composables/use-content-search.js')
    resetIndexSingleton()

    await expect(loadIndex()).rejects.toThrow()
  })

  it('allows retry after singleton reset following an error', async () => {
    const { loadIndex, resetIndexSingleton } = await import('../../runtime/composables/use-content-search.js')

    // First call fails
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as unknown as Response)
    resetIndexSingleton()
    await expect(loadIndex()).rejects.toThrow()

    // Reset and retry with a good response
    resetIndexSingleton()
    const indexJson = buildIndex()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(indexJson),
    } as unknown as Response)
    const index = await loadIndex() as ReturnType<typeof MiniSearch.loadJSON>
    expect(index).toBeDefined()
  })

  it('automatically retries after a fetch failure without manual singleton reset', async () => {
    const { loadIndex, resetIndexSingleton } = await import('../../runtime/composables/use-content-search.js')
    resetIndexSingleton()

    // First call fails — singleton should be cleared automatically
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as unknown as Response)
    await expect(loadIndex()).rejects.toThrow()

    // Second call without resetIndexSingleton — should retry and succeed
    const indexJson = buildIndex()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(indexJson),
    } as unknown as Response)
    const index = await loadIndex() as ReturnType<typeof MiniSearch.loadJSON>
    expect(index).toBeDefined()
    // Confirm the new singleton is cached (second call reuses it)
    expect(await loadIndex()).toBe(index)
  })
})
