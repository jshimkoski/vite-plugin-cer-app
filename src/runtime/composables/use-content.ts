import type { ContentItem, ContentMeta } from '../../types/content.js'
import { ContentClient } from '../content/client.js'

// ─── QueryBuilder ─────────────────────────────────────────────────────────────

export class QueryBuilder {
  private _prefix: string | undefined
  private _predicates: Array<(doc: ContentMeta) => boolean> = []
  private _sortField: string | undefined
  private _sortDir: 'asc' | 'desc' = 'asc'
  private _limit: number | undefined
  private _skip: number | undefined

  constructor(prefix?: string) {
    this._prefix = prefix
  }

  /** Filter results by a predicate. Receives a fully-typed `ContentMeta`. */
  where(predicate: (doc: ContentMeta) => boolean): this {
    this._predicates.push(predicate)
    return this
  }

  /** Sort by a frontmatter field. Defaults to ascending order. */
  sortBy(field: string, dir: 'asc' | 'desc' = 'asc'): this {
    this._sortField = field
    this._sortDir = dir
    return this
  }

  /** Cap the result count. */
  limit(n: number): this {
    this._limit = n
    return this
  }

  /** Skip the first `n` results (for pagination). */
  skip(n: number): this {
    this._skip = n
    return this
  }

  /** Returns all matching `ContentMeta` items (no body loaded). */
  async find(): Promise<ContentMeta[]> {
    const manifest = await ContentClient.getManifest()
    return this._applyFilters(manifest)
  }

  /** Returns the count of matching documents (no body loaded). */
  async count(): Promise<number> {
    const manifest = await ContentClient.getManifest()
    return this._applyFilters(manifest).length
  }

  /**
   * Returns the full `ContentItem` (body + toc) for the first matching document.
   * When a `_path` prefix is provided and no predicates/sort/pagination are set,
   * this fetches the single document directly by path.
   */
  async first(): Promise<ContentItem | null> {
    // Fast path: no filters, no sort, no pagination — fetch directly by path
    if (
      this._prefix !== undefined &&
      this._predicates.length === 0 &&
      this._sortField === undefined &&
      this._limit === undefined &&
      this._skip === undefined
    ) {
      return ContentClient.getItem(this._prefix)
    }

    // Slow path: apply filters on the manifest, then fetch the first match
    const manifest = await ContentClient.getManifest()
    const filtered = this._applyFilters(manifest)
    if (filtered.length === 0) return null
    return ContentClient.getItem(filtered[0]._path)
  }

  private _applyFilters(items: ContentMeta[]): ContentMeta[] {
    let result = items

    // Prefix filter
    if (this._prefix !== undefined) {
      const p = this._prefix
      result = result.filter(
        (doc) => doc._path === p || doc._path.startsWith(p + '/'),
      )
    }

    // Where predicates
    for (const pred of this._predicates) {
      result = result.filter(pred)
    }

    // Sort
    if (this._sortField !== undefined) {
      const field = this._sortField
      const dir = this._sortDir
      result = [...result].sort((a, b) => {
        const av = a[field] as string | number | undefined
        const bv = b[field] as string | number | undefined
        if (av === undefined && bv === undefined) return 0
        if (av === undefined) return 1
        if (bv === undefined) return -1
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return dir === 'asc' ? cmp : -cmp
      })
    }

    // Skip
    if (this._skip !== undefined) {
      result = result.slice(this._skip)
    }

    // Limit
    if (this._limit !== undefined) {
      result = result.slice(0, this._limit)
    }

    return result
  }
}

/**
 * Content query composable.
 *
 * Returns a `QueryBuilder` scoped to the given `_path` prefix. Chain filter,
 * sort, and pagination methods before calling a terminal method
 * (`.find()`, `.first()`, or `.count()`).
 *
 * @example
 * ```ts
 * // Single document
 * const doc = await queryContent('/blog/hello').first()
 *
 * // Listing — no body loaded
 * const posts = await queryContent('/blog')
 *   .where(doc => !doc.draft)
 *   .sortBy('date', 'desc')
 *   .limit(10)
 *   .find()
 * ```
 */
export function queryContent(path?: string): QueryBuilder {
  return new QueryBuilder(path)
}
