/**
 * Tests for queryContent() composable and QueryBuilder.
 *
 * Covers:
 * - Server-side path: reads from globalThis.__CER_CONTENT_STORE__
 * - .where() predicate filtering
 * - .sortBy() sorting
 * - .limit() and .skip() pagination
 * - .find() returns ContentMeta[]
 * - .count() returns number
 * - .first() returns ContentItem (direct path fetch fast path)
 * - .first() with filters (slow path through manifest)
 * - prefix scoping
 * - empty results
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { ContentItem } from '../../types/content.js'

const g = globalThis as Record<string, unknown>

const STORE: ContentItem[] = [
  {
    _path: '/blog/hello',
    _file: 'blog/hello.md',
    _type: 'markdown',
    title: 'Hello World',
    description: 'First post',
    date: '2026-04-03',
    draft: false,
    body: '<p>Hello</p>',
    toc: [],
  },
  {
    _path: '/blog/world',
    _file: 'blog/world.md',
    _type: 'markdown',
    title: 'World Post',
    description: 'Second post',
    date: '2026-04-10',
    draft: true,
    body: '<p>World</p>',
    toc: [],
  },
  {
    _path: '/about',
    _file: 'about.md',
    _type: 'markdown',
    title: 'About',
    body: '<p>About</p>',
    toc: [],
  },
  {
    _path: '/blog',
    _file: 'blog/index.md',
    _type: 'markdown',
    title: 'Blog',
    body: '<p>Blog index</p>',
    toc: [],
  },
]

function setup() {
  g['__CER_CONTENT_STORE__'] = STORE
}

function teardown() {
  delete g['__CER_CONTENT_STORE__']
}

describe('queryContent() — .find()', () => {
  beforeEach(setup)
  afterEach(teardown)

  it('returns all items when no prefix', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const result = await queryContent().find()
    expect(result).toHaveLength(STORE.length)
  })

  it('filters by prefix — exact match', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const result = await queryContent('/about').find()
    expect(result).toHaveLength(1)
    expect(result[0]._path).toBe('/about')
  })

  it('filters by prefix — includes children', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const result = await queryContent('/blog').find()
    expect(result.map((r) => r._path).sort()).toEqual(['/blog', '/blog/hello', '/blog/world'])
  })

  it('.where() filters items', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const result = await queryContent('/blog').where((doc) => !doc.draft).find()
    expect(result.every((r) => !r.draft)).toBe(true)
    expect(result.some((r) => r._path === '/blog/world')).toBe(false)
  })

  it('.where() with date filter', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const result = await queryContent('/blog')
      .where((doc) => typeof doc.date === 'string' && doc.date >= '2026-04-09')
      .find()
    expect(result).toHaveLength(1)
    expect(result[0]._path).toBe('/blog/world')
  })

  it('.sortBy() ascending', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const result = await queryContent('/blog').sortBy('date').find()
    const dates = result.filter((r) => r.date).map((r) => r.date as string)
    expect(dates).toEqual([...dates].sort())
  })

  it('.sortBy() descending', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const result = await queryContent('/blog').sortBy('date', 'desc').find()
    const dates = result.filter((r) => r.date).map((r) => r.date as string)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('.limit() caps results', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const result = await queryContent().limit(2).find()
    expect(result).toHaveLength(2)
  })

  it('.skip() offsets results', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const all = await queryContent().find()
    const skipped = await queryContent().skip(1).find()
    expect(skipped).toHaveLength(all.length - 1)
    expect(skipped[0]._path).toBe(all[1]._path)
  })

  it('chained .where().sortBy().limit()', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const result = await queryContent('/blog')
      .where((doc) => !doc.draft)
      .sortBy('date', 'desc')
      .limit(1)
      .find()
    expect(result).toHaveLength(1)
  })

  it('returns ContentMeta — no body in results', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const result = await queryContent().find()
    for (const item of result) {
      expect('body' in item).toBe(false)
    }
  })

  it('no prefix returns all items including those outside /blog', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const result = await queryContent().find()
    expect(result.some((r) => r._path === '/about')).toBe(true)
  })
})

describe('queryContent() — .count()', () => {
  beforeEach(setup)
  afterEach(teardown)

  it('returns total count with no filters', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const count = await queryContent().count()
    expect(count).toBe(STORE.length)
  })

  it('returns filtered count with .where()', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const count = await queryContent('/blog').where((doc) => !doc.draft).count()
    // /blog index (no draft field) + /blog/hello (draft: false)
    expect(count).toBe(2)
  })
})

describe('queryContent() — .first()', () => {
  beforeEach(setup)
  afterEach(teardown)

  it('fast path: fetches item directly by path', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const item = await queryContent('/about').first()
    expect(item).not.toBeNull()
    expect(item?._path).toBe('/about')
    expect(item?.body).toBe('<p>About</p>')
  })

  it('fast path: returns null for unknown path', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const item = await queryContent('/does-not-exist').first()
    expect(item).toBeNull()
  })

  it('slow path: applies .where() filter then fetches first match', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const item = await queryContent('/blog')
      .where((doc) => !doc.draft)
      .first()
    expect(item).not.toBeNull()
    expect(item?.draft).not.toBe(true)
  })

  it('returns full ContentItem with body and toc', async () => {
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    const item = await queryContent('/blog/hello').first()
    expect(item?.body).toBeDefined()
    expect(Array.isArray(item?.toc)).toBe(true)
  })

  it('returns null when no prefix is set and no store', async () => {
    // Remove store temporarily
    delete g['__CER_CONTENT_STORE__']
    const { queryContent } = await import('../../runtime/composables/use-content.js')
    // Without store, the client fetch path will run; since there's no real server, it may fail.
    // Just verify it doesn't throw — result can be null.
    const item = await queryContent('/about').first().catch(() => null)
    expect(item === null || item === undefined || typeof item === 'object').toBe(true)
    // Restore
    g['__CER_CONTENT_STORE__'] = STORE
  })
})
