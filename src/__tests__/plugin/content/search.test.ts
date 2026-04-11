import { describe, it, expect } from 'vitest'
import { buildSearchIndex } from '../../../plugin/content/search.js'
import MiniSearch from 'minisearch'
import type { ContentItem } from '../../../types/content.js'

const items: ContentItem[] = [
  {
    _path: '/blog/hello',
    _file: 'blog/hello.md',
    _type: 'markdown',
    title: 'Hello World',
    description: 'My first post about web components',
    body: '<p>body</p>',
    toc: [],
  },
  {
    _path: '/docs/getting-started',
    _file: 'docs/getting-started.md',
    _type: 'markdown',
    title: 'Getting Started',
    description: 'How to get started quickly',
    body: '<p>body</p>',
    toc: [],
  },
  {
    _path: '/about',
    _file: 'about.md',
    _type: 'markdown',
    // No title — should be excluded from index
    body: '<p>About</p>',
    toc: [],
  },
]

describe('buildSearchIndex', () => {
  it('returns a JSON string', () => {
    const result = buildSearchIndex(items)
    expect(typeof result).toBe('string')
    expect(() => JSON.parse(result)).not.toThrow()
  })

  it('serialised index can be loaded by MiniSearch', () => {
    const serialised = buildSearchIndex(items)
    expect(() =>
      MiniSearch.loadJSON(serialised, {
        fields: ['title', 'description'],
        storeFields: ['_path', 'title', 'description'],
        idField: '_path',
      }),
    ).not.toThrow()
  })

  it('search finds items by title', () => {
    const serialised = buildSearchIndex(items)
    const index = MiniSearch.loadJSON(serialised, {
      fields: ['title', 'description'],
      storeFields: ['_path', 'title', 'description'],
      idField: '_path',
    })
    const results = index.search('Hello')
    expect(results.some((r) => r._path === '/blog/hello')).toBe(true)
  })

  it('search finds items by description', () => {
    const serialised = buildSearchIndex(items)
    const index = MiniSearch.loadJSON(serialised, {
      fields: ['title', 'description'],
      storeFields: ['_path', 'title', 'description'],
      idField: '_path',
    })
    const results = index.search('quickly')
    expect(results.some((r) => r._path === '/docs/getting-started')).toBe(true)
  })

  it('items without title are excluded from index', () => {
    const serialised = buildSearchIndex(items)
    const index = MiniSearch.loadJSON(serialised, {
      fields: ['title', 'description'],
      storeFields: ['_path', 'title', 'description'],
      idField: '_path',
    })
    // Search for something that only appears in /about body (not indexed)
    const results = index.search('About')
    expect(results.some((r) => r._path === '/about')).toBe(false)
  })

  it('stored fields include _path, title, description', () => {
    const serialised = buildSearchIndex(items)
    const index = MiniSearch.loadJSON(serialised, {
      fields: ['title', 'description'],
      storeFields: ['_path', 'title', 'description'],
      idField: '_path',
    })
    const results = index.search('web')
    expect(results.length).toBeGreaterThan(0)
    const r = results[0] as { _path: string; title: string; description?: string }
    expect(r._path).toBeDefined()
    expect(r.title).toBeDefined()
  })

  it('returns empty index string when no items have titles', () => {
    const noTitleItems: ContentItem[] = [
      {
        _path: '/about',
        _file: 'about.md',
        _type: 'markdown',
        body: '<p>About</p>',
        toc: [],
      },
    ]
    const serialised = buildSearchIndex(noTitleItems)
    const index = MiniSearch.loadJSON(serialised, {
      fields: ['title', 'description'],
      storeFields: ['_path', 'title', 'description'],
      idField: '_path',
    })
    expect(index.documentCount).toBe(0)
  })
})
