/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ContentItem } from '../../types/content.js'
import {
  defineContentPageLoader,
  normalizeContentPath,
  useContentBreadcrumbs,
  useContentHeadings,
  useContentSeo,
} from '../../runtime/composables/use-content-page.js'
import {
  beginHeadCollection,
  endHeadCollection,
  serializeHeadTags,
} from '../../runtime/composables/use-head.js'

const docs: ContentItem[] = [
  {
    _path: '/',
    _file: 'index.md',
    _type: 'markdown',
    title: 'Home',
    body: '<h1>Home</h1>',
    toc: [],
  },
  {
    _path: '/guides',
    _file: 'guides/index.md',
    _type: 'markdown',
    title: 'Guides',
    body: '<h1>Guides</h1>',
    toc: [],
  },
  {
    _path: '/guides/getting-started',
    _file: 'guides/getting-started.md',
    _type: 'markdown',
    title: 'Getting Started',
    description: 'Build your first application.',
    body: '<h1>Getting Started</h1>',
    toc: [
      { depth: 1, id: 'getting-started', text: 'Getting Started' },
      { depth: 2, id: 'install', text: 'Install' },
      { depth: 3, id: 'configure', text: 'Configure' },
      { depth: 4, id: 'details', text: 'Details' },
    ],
  },
]

beforeEach(() => {
  ;(globalThis as Record<string, unknown>).__CER_CONTENT_STORE__ = docs
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__CER_CONTENT_STORE__
})

describe('content-page helpers', () => {
  it('normalizes catch-all params without double slashes', () => {
    expect(normalizeContentPath(undefined)).toBe('/')
    expect(normalizeContentPath('/guides/getting-started/')).toBe('/guides/getting-started')
  })

  it('loads the document and only its existing ancestor pages', async () => {
    const loader = defineContentPageLoader()
    const result = await loader({ params: { all: 'guides/getting-started' }, query: {} })

    expect(result.doc?.title).toBe('Getting Started')
    expect(result.existingPaths).toEqual(['/', '/guides'])
  })

  it('creates linked breadcrumbs while preserving non-page ancestors', () => {
    expect(useContentBreadcrumbs(
      '/guides/getting-started',
      docs[2],
      ['/'],
    )).toEqual([
      expect.objectContaining({ label: 'Home', path: '/', hasPage: true, isLast: false }),
      expect.objectContaining({ label: 'Guides', path: '/guides', hasPage: false, isLast: false }),
      expect.objectContaining({ label: 'Getting Started', path: '/guides/getting-started', isLast: true }),
    ])
  })

  it('selects configured heading depths without mutating the document', () => {
    expect(useContentHeadings(docs[2])).toEqual([
      { depth: 2, id: 'install', text: 'Install' },
      { depth: 3, id: 'configure', text: 'Configure' },
    ])
    expect(docs[2].toc).toHaveLength(4)
  })

  it('emits canonical, social, and breadcrumb SEO metadata', () => {
    const breadcrumbs = useContentBreadcrumbs(
      '/guides/getting-started',
      docs[2],
      ['/', '/guides'],
    )
    beginHeadCollection()
    useContentSeo({
      doc: docs[2],
      path: '/guides/getting-started',
      siteUrl: 'https://example.test/',
      siteName: 'Example',
      breadcrumbs,
      image: '/social.png',
    })
    const html = serializeHeadTags(endHeadCollection())

    expect(html).toContain('<title>Getting Started - Example</title>')
    expect(html).toContain('href="https://example.test/guides/getting-started"')
    expect(html).toContain('property="og:image" content="https://example.test/social.png"')
    expect(html).toContain('application/ld+json')
    expect(html).toContain('BreadcrumbList')
  })

  it('omits non-page ancestors from breadcrumb structured data', () => {
    const breadcrumbs = useContentBreadcrumbs(
      '/guides/getting-started',
      docs[2],
      ['/'],
    )
    beginHeadCollection()
    useContentSeo({
      doc: docs[2],
      path: '/guides/getting-started',
      siteUrl: 'https://example.test',
      breadcrumbs,
    })
    const html = serializeHeadTags(endHeadCollection())

    expect(html).toContain('"item":"https://example.test"')
    expect(html).not.toContain('"item":"https://example.test/guides"')
    expect(html).toContain('"item":"https://example.test/guides/getting-started"')
  })

  it('restores indexable robots metadata after a not-found render', () => {
    beginHeadCollection()
    useContentSeo({
      doc: null,
      path: '/missing',
      siteUrl: 'https://example.test',
    })
    useContentSeo({
      doc: docs[0],
      path: '/',
      siteUrl: 'https://example.test',
    })
    const html = serializeHeadTags(endHeadCollection())

    expect(html).toContain('<meta name="robots" content="index, follow">')
    expect(html).not.toContain('content="noindex"')

    document.head.innerHTML = `
      <title>Server-rendered home</title>
      <link rel="canonical" href="https://example.test">
      <meta name="robots" content="index, follow">
    `
    useContentSeo({
      doc: null,
      path: '/',
      siteUrl: 'https://example.test',
    })
    expect(document.title).toBe('Server-rendered home')
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow')

    window.history.replaceState({}, '', '/guides/getting-started')
    document.head.innerHTML = `
      <title>Server-rendered guide</title>
      <link rel="canonical" href="https://example.test/guides/getting-started">
      <meta name="robots" content="index, follow">
    `
    useContentSeo({
      doc: null,
      // Catch-all props can still expose their pre-upgrade default during the
      // hydrate:none custom-element setup pass.
      path: '/',
      siteUrl: 'https://example.test',
    })
    expect(document.title).toBe('Server-rendered guide')
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow')

    window.history.replaceState({}, '', '/missing')
    useContentSeo({
      doc: null,
      path: '/missing',
      siteUrl: 'https://example.test',
    })
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')

    useContentSeo({
      doc: docs[0],
      path: '/',
      siteUrl: 'https://example.test',
    })
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow')
  })
})
