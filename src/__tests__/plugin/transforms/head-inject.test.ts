import { describe, it, expect, beforeEach } from 'vitest'
import { injectHead, HeadCollector } from '../../../plugin/transforms/head-inject.js'
import type { HeadTag } from '../../../plugin/transforms/head-inject.js'

// ─── injectHead ───────────────────────────────────────────────────────────────

describe('injectHead', () => {
  it('inserts serialized tags before </head>', () => {
    const html = '<html><head></head><body></body></html>'
    const result = injectHead(html, [{ tag: 'title', innerHTML: 'Hello' }])
    expect(result).toContain('<title>Hello</title>')
    const headClose = result.indexOf('</head>')
    const titlePos = result.indexOf('<title>')
    expect(titlePos).toBeLessThan(headClose)
  })

  it('returns html unchanged when tags array is empty', () => {
    const html = '<html><head></head></html>'
    expect(injectHead(html, [])).toBe(html)
  })

  it('prepends content when no </head> found', () => {
    const html = '<div>body only</div>'
    const result = injectHead(html, [{ tag: 'meta', attrs: { name: 'test', content: 'val' } }])
    expect(result.startsWith('<meta')).toBe(true)
    expect(result).toContain('<div>body only</div>')
  })

  it('handles void elements without closing tag (meta)', () => {
    const html = '<html><head></head></html>'
    const result = injectHead(html, [{ tag: 'meta', attrs: { name: 'desc', content: 'test' } }])
    expect(result).toContain('<meta name="desc" content="test">')
    expect(result).not.toContain('</meta>')
  })

  it('handles void elements without closing tag (link)', () => {
    const html = '<html><head></head></html>'
    const result = injectHead(html, [{ tag: 'link', attrs: { rel: 'stylesheet', href: '/a.css' } }])
    expect(result).toContain('<link rel="stylesheet" href="/a.css">')
    expect(result).not.toContain('</link>')
  })

  it('renders multiple tags separated by newlines', () => {
    const html = '<html><head></head></html>'
    const tags: HeadTag[] = [
      { tag: 'title', innerHTML: 'Page' },
      { tag: 'meta', attrs: { name: 'desc', content: 'A page' } },
    ]
    const result = injectHead(html, tags)
    expect(result).toContain('<title>Page</title>')
    expect(result).toContain('<meta name="desc" content="A page">')
  })

  it('escapes double-quote in attribute values', () => {
    const html = '<html><head></head></html>'
    const result = injectHead(html, [{ tag: 'meta', attrs: { content: '"quoted"' } }])
    expect(result).toContain('&quot;quoted&quot;')
    expect(result).not.toContain('"quoted"')
  })

  it('escapes < and > in attribute values', () => {
    const html = '<html><head></head></html>'
    const result = injectHead(html, [{ tag: 'meta', attrs: { content: '<script>' } }])
    expect(result).toContain('&lt;script&gt;')
    expect(result).not.toContain('<script>')
  })

  it('renders boolean-style attribute when value is empty string', () => {
    const html = '<html><head></head></html>'
    const result = injectHead(html, [{ tag: 'script', attrs: { defer: '', src: '/app.js' } }])
    expect(result).toContain('defer')
    // Empty value should render as just the key, not key=""
    expect(result).toContain('defer ')
  })

  it('renders non-void tag with innerHTML', () => {
    const html = '<html><head></head></html>'
    const result = injectHead(html, [{ tag: 'script', innerHTML: 'window.x=1' }])
    expect(result).toContain('<script>window.x=1</script>')
  })

  it('renders non-void tag without innerHTML as open+close', () => {
    const html = '<html><head></head></html>'
    const result = injectHead(html, [{ tag: 'style', attrs: { type: 'text/css' } }])
    expect(result).toContain('<style type="text/css"></style>')
  })
})

// ─── HeadCollector ────────────────────────────────────────────────────────────

describe('HeadCollector', () => {
  let collector: HeadCollector

  beforeEach(() => {
    collector = new HeadCollector()
  })

  it('collect() stores a HeadInput', () => {
    collector.collect({ title: 'Test' })
    expect(collector.getCollected()).toHaveLength(1)
    expect(collector.getCollected()[0].title).toBe('Test')
  })

  it('getCollected() returns a copy — mutations do not affect internal state', () => {
    collector.collect({ title: 'Test' })
    const copy = collector.getCollected()
    copy.push({ title: 'Extra' })
    expect(collector.getCollected()).toHaveLength(1)
  })

  it('reset() clears collected inputs', () => {
    collector.collect({ title: 'Test' })
    collector.reset()
    expect(collector.getCollected()).toHaveLength(0)
  })

  it('serialize() returns title tag', () => {
    collector.collect({ title: 'My Page' })
    expect(collector.serialize()).toContain('<title>My Page</title>')
  })

  it('last collected title wins in serialization', () => {
    collector.collect({ title: 'First' })
    collector.collect({ title: 'Second' })
    const html = collector.serialize()
    expect(html).toContain('Second')
    expect(html).not.toContain('First')
  })

  it('deduplicates meta tags by name (later overwrites earlier)', () => {
    collector.collect({ meta: [{ name: 'description', content: 'First' }] })
    collector.collect({ meta: [{ name: 'description', content: 'Second' }] })
    const html = collector.serialize()
    expect((html.match(/<meta/g) ?? []).length).toBe(1)
    expect(html).toContain('Second')
    expect(html).not.toContain('First')
  })

  it('deduplicates meta tags by property', () => {
    collector.collect({ meta: [{ property: 'og:title', content: 'A' }] })
    collector.collect({ meta: [{ property: 'og:title', content: 'B' }] })
    const html = collector.serialize()
    expect((html.match(/<meta/g) ?? []).length).toBe(1)
    expect(html).toContain('B')
  })

  it('deduplicates link tags by rel+href', () => {
    collector.collect({ link: [{ rel: 'canonical', href: 'https://example.com' }] })
    collector.collect({ link: [{ rel: 'canonical', href: 'https://example.com' }] })
    const html = collector.serialize()
    expect((html.match(/<link/g) ?? []).length).toBe(1)
  })

  it('accumulates script tags without deduplication', () => {
    collector.collect({ script: [{ src: '/a.js' }] })
    collector.collect({ script: [{ src: '/b.js' }] })
    const html = collector.serialize()
    expect((html.match(/<script/g) ?? []).length).toBe(2)
  })

  it('accumulates style tags without deduplication', () => {
    collector.collect({ style: [{ innerHTML: 'a { color: red }' }] })
    collector.collect({ style: [{ innerHTML: 'b { color: blue }' }] })
    const html = collector.serialize()
    expect((html.match(/<style/g) ?? []).length).toBe(2)
  })

  it('escapes HTML in title to prevent XSS', () => {
    collector.collect({ title: '<script>alert(1)</script>' })
    const html = collector.serialize()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('serialize() returns empty string when nothing collected', () => {
    expect(collector.serialize()).toBe('')
  })
})
