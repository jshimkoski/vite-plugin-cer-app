import { describe, it, expect } from 'vitest'
import { fileToContentPath } from '../../../plugin/content/path-utils.js'

const DIR = '/project/app/content'

// ─── fileToContentPath ────────────────────────────────────────────────────────

describe('fileToContentPath', () => {
  it('maps index.md to /', () => {
    expect(fileToContentPath(`${DIR}/index.md`, DIR)).toBe('/')
  })

  it('strips numeric prefix from a root-level file segment', () => {
    expect(fileToContentPath(`${DIR}/01.about.md`, DIR)).toBe('/about')
  })

  it('maps about.md to /about', () => {
    expect(fileToContentPath(`${DIR}/about.md`, DIR)).toBe('/about')
  })

  it('strips numeric prefixes from directory segments', () => {
    expect(fileToContentPath(`${DIR}/01.docs/02.getting-started.md`, DIR)).toBe('/docs/getting-started')
  })

  it('maps blog/index.md to /blog', () => {
    expect(fileToContentPath(`${DIR}/blog/index.md`, DIR)).toBe('/blog')
  })

  it('strips numeric prefix before handling index files', () => {
    expect(fileToContentPath(`${DIR}/01.blog/02.index.md`, DIR)).toBe('/blog')
  })

  it('maps blog/2026-04-03-hello.md to /blog/hello (strips date prefix)', () => {
    expect(fileToContentPath(`${DIR}/blog/2026-04-03-hello.md`, DIR)).toBe('/blog/hello')
  })

  it('strips numeric prefix before date prefix on the final segment', () => {
    expect(fileToContentPath(`${DIR}/blog/01.2026-04-03-hello.md`, DIR)).toBe('/blog/hello')
  })

  it('maps docs/getting-started.md to /docs/getting-started', () => {
    expect(fileToContentPath(`${DIR}/docs/getting-started.md`, DIR)).toBe('/docs/getting-started')
  })

  it('maps data/products.json to /data/products', () => {
    expect(fileToContentPath(`${DIR}/data/products.json`, DIR)).toBe('/data/products')
  })

  it('maps deeply nested file', () => {
    expect(fileToContentPath(`${DIR}/a/b/c.md`, DIR)).toBe('/a/b/c')
  })

  it('does not strip date from non-last segments', () => {
    expect(fileToContentPath(`${DIR}/2026-01-01-blog/hello.md`, DIR)).toBe('/2026-01-01-blog/hello')
  })

  it('handles .json extension', () => {
    expect(fileToContentPath(`${DIR}/products.json`, DIR)).toBe('/products')
  })

  it('maps index-only path at root correctly', () => {
    expect(fileToContentPath(`${DIR}/index.md`, DIR)).toBe('/')
  })

  it('strips date from root-level dated file', () => {
    expect(fileToContentPath(`${DIR}/2026-04-03-hello.md`, DIR)).toBe('/hello')
  })
})

