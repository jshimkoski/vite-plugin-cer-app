import { describe, it, expect } from 'vitest'
import {
  injectFaviconLink,
  injectCanonicalLink,
  addNoopenerToExternalLinks,
  generateRobotsTxt,
} from '../../plugin/html-post-process.js'

// ---------------------------------------------------------------------------
// injectFaviconLink
// ---------------------------------------------------------------------------

describe('injectFaviconLink', () => {
  it('injects link before </head> when none exists', () => {
    const html = '<html><head><title>Test</title></head><body></body></html>'
    const result = injectFaviconLink(html, '/favicon.ico')
    expect(result).toContain('<link rel="icon" href="/favicon.ico">')
    expect(result.indexOf('<link rel="icon"')).toBeLessThan(result.indexOf('</head>'))
  })

  it('does not inject when rel="icon" already present', () => {
    const html = '<html><head><link rel="icon" href="/custom.ico"></head></html>'
    expect(injectFaviconLink(html, '/favicon.ico')).toBe(html)
  })

  it('does not inject when rel="shortcut icon" already present', () => {
    const html = '<html><head><link rel="shortcut icon" href="/old.ico"></head></html>'
    expect(injectFaviconLink(html, '/favicon.ico')).toBe(html)
  })

  it('prepends tag when no </head> is found', () => {
    const html = '<html><body></body></html>'
    const result = injectFaviconLink(html, '/favicon.svg')
    expect(result).toContain('<link rel="icon" href="/favicon.svg">')
  })

  it('supports svg favicon href', () => {
    const html = '<html><head></head></html>'
    expect(injectFaviconLink(html, '/favicon.svg')).toContain('href="/favicon.svg"')
  })
})

// ---------------------------------------------------------------------------
// injectCanonicalLink
// ---------------------------------------------------------------------------

describe('injectCanonicalLink', () => {
  it('injects canonical before </head>', () => {
    const html = '<html><head><title>T</title></head><body></body></html>'
    const result = injectCanonicalLink(html, 'https://example.com/about')
    expect(result).toContain('<link rel="canonical" href="https://example.com/about">')
    expect(result.indexOf('<link rel="canonical"')).toBeLessThan(result.indexOf('</head>'))
  })

  it('does not inject when canonical already present', () => {
    const html = '<head><link rel="canonical" href="https://example.com/"></head>'
    expect(injectCanonicalLink(html, 'https://example.com/')).toBe(html)
  })

  it('escapes & in the URL', () => {
    const html = '<html><head></head></html>'
    const result = injectCanonicalLink(html, 'https://example.com/?a=1&b=2')
    expect(result).toContain('href="https://example.com/?a=1&amp;b=2"')
  })

  it('prepends tag when no </head> is found', () => {
    const html = '<html><body></body></html>'
    const result = injectCanonicalLink(html, 'https://example.com/')
    expect(result).toContain('<link rel="canonical"')
  })
})

// ---------------------------------------------------------------------------
// addNoopenerToExternalLinks
// ---------------------------------------------------------------------------

describe('addNoopenerToExternalLinks', () => {
  it('adds rel to target="_blank" link with no rel', () => {
    const html = '<a href="https://example.com" target="_blank">Link</a>'
    const result = addNoopenerToExternalLinks(html)
    expect(result).toContain('rel="noopener noreferrer"')
  })

  it('does not modify links without target="_blank"', () => {
    const html = '<a href="https://example.com">Link</a>'
    expect(addNoopenerToExternalLinks(html)).toBe(html)
  })

  it('does not duplicate when both values already present', () => {
    const html = '<a href="https://x.com" target="_blank" rel="noopener noreferrer">X</a>'
    const result = addNoopenerToExternalLinks(html)
    expect(result).toBe(html)
  })

  it('appends missing noopener to existing rel', () => {
    const html = '<a href="https://x.com" target="_blank" rel="noreferrer">X</a>'
    const result = addNoopenerToExternalLinks(html)
    expect(result).toContain('noopener')
    expect(result).toContain('noreferrer')
  })

  it('appends missing noreferrer to existing rel', () => {
    const html = '<a href="https://x.com" target="_blank" rel="noopener">X</a>'
    const result = addNoopenerToExternalLinks(html)
    expect(result).toContain('noreferrer')
  })

  it('handles target="_blank" after href in attributes', () => {
    const html = '<a href="https://x.com" class="btn" target="_blank">X</a>'
    const result = addNoopenerToExternalLinks(html)
    expect(result).toContain('rel="noopener noreferrer"')
  })

  it('handles multiple links in the same document', () => {
    const html = [
      '<a href="https://a.com" target="_blank">A</a>',
      '<a href="/internal">Internal</a>',
      '<a href="https://b.com" target="_blank">B</a>',
    ].join('')
    const result = addNoopenerToExternalLinks(html)
    expect(result.match(/rel="noopener noreferrer"/g)?.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// generateRobotsTxt
// ---------------------------------------------------------------------------

describe('generateRobotsTxt', () => {
  it('generates allow-all rules without siteUrl', () => {
    const txt = generateRobotsTxt(null)
    expect(txt).toContain('User-agent: *')
    expect(txt).toContain('Allow: /')
    expect(txt).not.toContain('Sitemap:')
  })

  it('includes Sitemap directive when siteUrl is provided', () => {
    const txt = generateRobotsTxt('https://example.com')
    expect(txt).toContain('Sitemap: https://example.com/sitemap.xml')
  })

  it('ends with a newline', () => {
    expect(generateRobotsTxt(null).endsWith('\n')).toBe(true)
    expect(generateRobotsTxt('https://example.com').endsWith('\n')).toBe(true)
  })
})
