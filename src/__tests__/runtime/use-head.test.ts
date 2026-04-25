/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  beginHeadCollection,
  endHeadCollection,
  serializeHeadTags,
  useHead,
} from '../../runtime/composables/use-head.js'

// ─── SSR collection ───────────────────────────────────────────────────────────

describe('SSR head collection (beginHeadCollection / endHeadCollection)', () => {
  afterEach(() => {
    // Always clean up so we don't leak SSR collector state into client-mode tests
    endHeadCollection()
  })

  it('useHead pushes to the SSR collector when collection is active', () => {
    beginHeadCollection()
    useHead({ title: 'Test Page' })
    const collected = endHeadCollection()
    expect(collected).toHaveLength(1)
    expect(collected[0].title).toBe('Test Page')
  })

  it('endHeadCollection returns empty array when nothing was collected', () => {
    beginHeadCollection()
    expect(endHeadCollection()).toEqual([])
  })

  it('endHeadCollection resets the collector (subsequent calls return empty)', () => {
    beginHeadCollection()
    useHead({ title: 'A' })
    endHeadCollection()
    // After reset, another endHeadCollection (without beginHeadCollection) returns []
    expect(endHeadCollection()).toEqual([])
  })

  it('collects multiple useHead calls in order', () => {
    beginHeadCollection()
    useHead({ title: 'First' })
    useHead({ meta: [{ name: 'description', content: 'Desc' }] })
    const collected = endHeadCollection()
    expect(collected).toHaveLength(2)
    expect(collected[0].title).toBe('First')
    expect(collected[1].meta![0].name).toBe('description')
  })
})

// ─── serializeHeadTags ────────────────────────────────────────────────────────

describe('serializeHeadTags', () => {
  it('returns empty string for an empty array', () => {
    expect(serializeHeadTags([])).toBe('')
  })

  it('serializes a title tag', () => {
    const html = serializeHeadTags([{ title: 'My Page' }])
    expect(html).toContain('<title>My Page</title>')
  })

  it('last title wins when multiple inputs have titles', () => {
    const html = serializeHeadTags([{ title: 'First' }, { title: 'Second' }])
    expect(html).toContain('Second')
    expect(html).not.toContain('First')
  })

  it('escapes HTML entities in title to prevent XSS', () => {
    const html = serializeHeadTags([{ title: '<script>alert(1)</script>' }])
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('serializes meta tags', () => {
    const html = serializeHeadTags([{ meta: [{ name: 'description', content: 'A desc' }] }])
    expect(html).toContain('<meta name="description" content="A desc">')
  })

  it('deduplicates meta tags by name — last value wins', () => {
    const html = serializeHeadTags([
      { meta: [{ name: 'description', content: 'First' }] },
      { meta: [{ name: 'description', content: 'Second' }] },
    ])
    expect((html.match(/<meta/g) ?? []).length).toBe(1)
    expect(html).toContain('Second')
    expect(html).not.toContain('First')
  })

  it('deduplicates meta tags by property — last value wins', () => {
    const html = serializeHeadTags([
      { meta: [{ property: 'og:title', content: 'A' }] },
      { meta: [{ property: 'og:title', content: 'B' }] },
    ])
    expect((html.match(/<meta/g) ?? []).length).toBe(1)
    expect(html).toContain('B')
  })

  it('serializes link tags', () => {
    const html = serializeHeadTags([{ link: [{ rel: 'canonical', href: 'https://example.com' }] }])
    expect(html).toContain('<link rel="canonical" href="https://example.com">')
  })

  it('deduplicates link tags by rel+href', () => {
    const html = serializeHeadTags([
      { link: [{ rel: 'stylesheet', href: '/main.css' }] },
      { link: [{ rel: 'stylesheet', href: '/main.css' }] },
    ])
    expect((html.match(/<link/g) ?? []).length).toBe(1)
  })

  it('serializes script tag with src', () => {
    const html = serializeHeadTags([{ script: [{ src: '/app.js' }] }])
    expect(html).toContain('src="/app.js"')
    expect(html).toContain('<script')
    expect(html).toContain('</script>')
  })

  it('serializes script tag with innerHTML', () => {
    const html = serializeHeadTags([{ script: [{ innerHTML: 'window.foo = 1' }] }])
    expect(html).toContain('window.foo = 1')
    expect(html).toContain('<script')
    expect(html).toContain('</script>')
  })

  it('does not deduplicate script tags', () => {
    const html = serializeHeadTags([
      { script: [{ src: '/a.js' }] },
      { script: [{ src: '/b.js' }] },
    ])
    expect((html.match(/<script/g) ?? []).length).toBe(2)
  })

  it('serializes style tags with innerHTML', () => {
    const html = serializeHeadTags([{ style: [{ innerHTML: 'body { margin: 0 }' }] }])
    expect(html).toContain('<style')
    expect(html).toContain('body { margin: 0 }')
    expect(html).toContain('</style>')
  })

  it('serializes style tags without innerHTML as self-containing empty tag', () => {
    const html = serializeHeadTags([{ style: [{ media: 'print' }] }])
    expect(html).toContain('<style')
    expect(html).toContain('media="print"')
    expect(html).toContain('></style>')
  })

  it('escapes attribute values in meta content', () => {
    const html = serializeHeadTags([{ meta: [{ name: 'test', content: '"quoted"' }] }])
    expect(html).toContain('&quot;quoted&quot;')
    expect(html).not.toContain('"quoted"')
  })
})

// ─── useHead — client mode (DOM) ─────────────────────────────────────────────

describe('useHead — client-side DOM updates', () => {
  beforeEach(() => {
    // Ensure SSR collector is null so useHead runs in client mode
    endHeadCollection()
    document.head.innerHTML = ''
    document.title = ''
  })

  it('sets document.title', () => {
    useHead({ title: 'Hello World' })
    expect(document.title).toBe('Hello World')
  })

  it('updates document.title on subsequent calls', () => {
    useHead({ title: 'First' })
    useHead({ title: 'Second' })
    expect(document.title).toBe('Second')
  })

  it('creates a new meta[name] tag', () => {
    useHead({ meta: [{ name: 'description', content: 'A test page' }] })
    const meta = document.querySelector('meta[name="description"]')
    expect(meta).not.toBeNull()
    expect(meta?.getAttribute('content')).toBe('A test page')
  })

  it('updates an existing meta[name] tag instead of creating a duplicate', () => {
    const existing = document.createElement('meta')
    existing.setAttribute('name', 'description')
    existing.setAttribute('content', 'Old content')
    document.head.appendChild(existing)

    useHead({ meta: [{ name: 'description', content: 'New content' }] })

    const metas = document.querySelectorAll('meta[name="description"]')
    expect(metas.length).toBe(1)
    expect(metas[0].getAttribute('content')).toBe('New content')
  })

  it('creates a new meta[property] tag', () => {
    useHead({ meta: [{ property: 'og:title', content: 'OG Title' }] })
    const meta = document.querySelector('meta[property="og:title"]')
    expect(meta).not.toBeNull()
    expect(meta?.getAttribute('content')).toBe('OG Title')
  })

  it('creates a new link tag', () => {
    useHead({ link: [{ rel: 'canonical', href: 'https://example.com' }] })
    const link = document.querySelector('link[rel="canonical"]')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toBe('https://example.com')
  })

  it('does not duplicate link with same rel+href', () => {
    useHead({ link: [{ rel: 'canonical', href: 'https://example.com' }] })
    useHead({ link: [{ rel: 'canonical', href: 'https://example.com' }] })
    const links = document.querySelectorAll('link[rel="canonical"][href="https://example.com"]')
    expect(links.length).toBe(1)
  })

  it('updates canonical href in-place when URL changes (no duplicate)', () => {
    useHead({ link: [{ rel: 'canonical', href: 'https://example.com/page-a' }] })
    useHead({ link: [{ rel: 'canonical', href: 'https://example.com/page-b' }] })
    const links = document.querySelectorAll('link[rel="canonical"]')
    expect(links.length).toBe(1)
    expect(links[0].getAttribute('href')).toBe('https://example.com/page-b')
  })

  it('updates icon link in-place when href changes (no duplicate)', () => {
    useHead({ link: [{ rel: 'icon', href: '/favicon.ico' }] })
    useHead({ link: [{ rel: 'icon', href: '/favicon.svg' }] })
    const links = document.querySelectorAll('link[rel="icon"]')
    expect(links.length).toBe(1)
    expect(links[0].getAttribute('href')).toBe('/favicon.svg')
  })

  it('does NOT deduplicate stylesheet links by rel alone (multiple hrefs allowed)', () => {
    useHead({ link: [{ rel: 'stylesheet', href: '/a.css' }] })
    useHead({ link: [{ rel: 'stylesheet', href: '/b.css' }] })
    const links = document.querySelectorAll('link[rel="stylesheet"]')
    expect(links.length).toBe(2)
  })

  it('adds a script tag with src', () => {
    useHead({ script: [{ src: '/analytics.js' }] })
    const script = document.querySelector('script[src="/analytics.js"]')
    expect(script).not.toBeNull()
  })

  it('does not add a duplicate script with the same src', () => {
    useHead({ script: [{ src: '/analytics.js' }] })
    useHead({ script: [{ src: '/analytics.js' }] })
    const scripts = document.querySelectorAll('script[src="/analytics.js"]')
    expect(scripts.length).toBe(1)
  })

  it('adds an inline script (innerHTML, no src)', () => {
    useHead({ script: [{ innerHTML: 'window.foo = 1' }] })
    const scripts = document.querySelectorAll('script')
    expect(scripts.length).toBe(1)
    expect(scripts[0].textContent).toBe('window.foo = 1')
  })

  it('ignores meta without name or property', () => {
    const before = document.head.querySelectorAll('meta').length
    useHead({ meta: [{ charset: 'UTF-8' }] })
    // charset meta has no name/property so the code skips it on client
    expect(document.head.querySelectorAll('meta').length).toBe(before)
  })

  it('ignores link without rel or href', () => {
    const before = document.head.querySelectorAll('link').length
    useHead({ link: [{ type: 'text/css' }] })
    expect(document.head.querySelectorAll('link').length).toBe(before)
  })

  it('adds script with src and sets extra attributes (type, async)', () => {
    useHead({ script: [{ src: '/module.js', type: 'module', async: '' }] })
    const el = document.querySelector('script[src="/module.js"]')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('type')).toBe('module')
    // async attribute is present (empty string)
    expect(el?.hasAttribute('async')).toBe(true)
  })

  it('adds inline script with extra attributes (type)', () => {
    useHead({ script: [{ innerHTML: 'window.x = 2', type: 'application/json' }] })
    const scripts = document.querySelectorAll('script[type="application/json"]')
    expect(scripts.length).toBe(1)
    expect(scripts[0].textContent).toBe('window.x = 2')
  })

  it('updates existing application/ld+json content in-place (no duplicate)', () => {
    useHead({ script: [{ type: 'application/ld+json', innerHTML: '{"@type":"WebPage","name":"A"}' }] })
    useHead({ script: [{ type: 'application/ld+json', innerHTML: '{"@type":"WebPage","name":"B"}' }] })
    const scripts = document.querySelectorAll('script[type="application/ld+json"]')
    expect(scripts.length).toBe(1)
    expect(scripts[0].textContent).toBe('{"@type":"WebPage","name":"B"}')
  })

  it('creates application/ld+json script when none exists', () => {
    useHead({ script: [{ type: 'application/ld+json', innerHTML: '{"@type":"WebPage"}' }] })
    const scripts = document.querySelectorAll('script[type="application/ld+json"]')
    expect(scripts.length).toBe(1)
    expect(scripts[0].textContent).toBe('{"@type":"WebPage"}')
  })

  it('does NOT deduplicate non-ld+json inline scripts', () => {
    useHead({ script: [{ innerHTML: 'window.a = 1' }] })
    useHead({ script: [{ innerHTML: 'window.b = 2' }] })
    const scripts = document.querySelectorAll('script:not([src]):not([type])')
    expect(scripts.length).toBe(2)
  })
})
