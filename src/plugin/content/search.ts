import MiniSearch from 'minisearch'
import type { ContentItem } from '../../types/content.js'

/**
 * Builds and serialises a MiniSearch full-text search index over `title` and `description`.
 *
 * Stored fields: `_path`, `title`, `description` — match `ContentSearchResult` exactly.
 * Returns the serialised index as a JSON string ready to be written to `search-index.json`.
 */
export function buildSearchIndex(items: ContentItem[]): string {
  const index = new MiniSearch({
    fields: ['title', 'description'],
    storeFields: ['_path', 'title', 'description'],
    idField: '_path',
  })

  const docs = items
    .filter((item) => item.title !== undefined)
    .map((item) => ({
      _path: item._path,
      title: (item.title as string) ?? '',
      description: (item.description as string) ?? '',
    }))

  index.addAll(docs)

  return JSON.stringify(index)
}
