/**
 * Tests for cerContent() plugin factory helpers:
 *   - CONTENT_STORE_KEY constant
 *   - resolveContentDir()
 *   - loadContentStore()
 *
 * The Vite plugin hooks (buildStart, configureServer, closeBundle) are exercised
 * by the e2e suite across all three build modes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import {
  CONTENT_STORE_KEY,
  resolveContentDir,
  loadContentStore,
} from '../../../plugin/content/index.js'

let tmpDir: string
let contentDir: string

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cer-content-loader-'))
  contentDir = join(tmpDir, 'content')
  mkdirSync(contentDir, { recursive: true })
  mkdirSync(join(contentDir, 'blog'), { recursive: true })
  mkdirSync(join(contentDir, 'data'), { recursive: true })

  writeFileSync(join(contentDir, 'index.md'), '---\ntitle: Home\ndescription: Welcome\n---\n\n# Home\n')
  writeFileSync(join(contentDir, 'about.md'), '---\ntitle: About\ndate: 2026-04-01\n---\n\n# About\n')
  writeFileSync(
    join(contentDir, 'blog', '2026-04-03-hello.md'),
    '---\ntitle: Hello World\ndate: 2026-04-03\ndraft: false\n---\n\nHello post!',
  )
  writeFileSync(
    join(contentDir, 'blog', 'secret.md'),
    '---\ntitle: Secret Draft\ndraft: true\n---\n\nSecret!',
  )
  writeFileSync(join(contentDir, 'data', 'products.json'), JSON.stringify([{ id: 1 }]))
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── CONTENT_STORE_KEY ────────────────────────────────────────────────────────

describe('CONTENT_STORE_KEY', () => {
  it('equals __CER_CONTENT_STORE__', () => {
    expect(CONTENT_STORE_KEY).toBe('__CER_CONTENT_STORE__')
  })
})

// ─── resolveContentDir ────────────────────────────────────────────────────────

describe('resolveContentDir', () => {
  it('uses "content" when no config is supplied', () => {
    expect(resolveContentDir('/root')).toBe('/root/content')
  })

  it('uses "content" when config.dir is undefined', () => {
    expect(resolveContentDir('/root', {})).toBe('/root/content')
  })

  it('uses the configured dir when provided', () => {
    expect(resolveContentDir('/root', { dir: 'docs' })).toBe('/root/docs')
  })

  it('resolves relative to the project root, not the app source dir', () => {
    // content/ is a sibling of app/, not a child of it
    expect(resolveContentDir('/workspace/my-project', { dir: 'posts' })).toBe(
      '/workspace/my-project/posts',
    )
  })
})

// ─── loadContentStore ─────────────────────────────────────────────────────────

describe('loadContentStore — nonexistent dir', () => {
  it('returns empty array when contentDir does not exist', async () => {
    const items = await loadContentStore('/path/does/not/exist', false)
    expect(items).toEqual([])
  })
})

describe('loadContentStore — drafts excluded by default (includeDrafts=false)', () => {
  it('loads all non-draft files', async () => {
    const items = await loadContentStore(contentDir, false)
    const paths = items.map((i) => i._path).sort()
    // Root, about, blog/hello (not secret — it is a draft), data/products
    expect(paths).toContain('/')
    expect(paths).toContain('/about')
    expect(paths).toContain('/blog/hello')
    expect(paths).not.toContain('/blog/secret')
    expect(paths).toContain('/data/products')
  })

  it('excludes draft items', async () => {
    const items = await loadContentStore(contentDir, false)
    const secret = items.find((i) => i._path === '/blog/secret')
    expect(secret).toBeUndefined()
  })

  it('strips date prefix from slug', async () => {
    const items = await loadContentStore(contentDir, false)
    expect(items.find((i) => i._path === '/blog/hello')).toBeDefined()
    expect(items.find((i) => i._path === '/blog/2026-04-03-hello')).toBeUndefined()
  })

  it('each item has required ContentItem fields', async () => {
    const items = await loadContentStore(contentDir, false)
    for (const item of items) {
      expect(typeof item._path).toBe('string')
      expect(typeof item._file).toBe('string')
      expect(item._type === 'markdown' || item._type === 'json').toBe(true)
      expect(typeof item.body).toBe('string')
      expect(Array.isArray(item.toc)).toBe(true)
    }
  })

  it('normalises date fields to strings (not Date objects)', async () => {
    const items = await loadContentStore(contentDir, false)
    const about = items.find((i) => i._path === '/about')
    expect(about).toBeDefined()
    expect(typeof about?.date).toBe('string')
    expect(about?.date as string).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('loadContentStore — drafts included (includeDrafts=true)', () => {
  it('includes draft items when includeDrafts=true', async () => {
    const items = await loadContentStore(contentDir, true)
    const secret = items.find((i) => i._path === '/blog/secret')
    expect(secret).toBeDefined()
    expect(secret?.draft).toBe(true)
  })

  it('includes non-draft items', async () => {
    const items = await loadContentStore(contentDir, true)
    expect(items.find((i) => i._path === '/blog/hello')).toBeDefined()
    expect(items.find((i) => i._path === '/about')).toBeDefined()
  })
})

describe('loadContentStore — JSON files', () => {
  it('includes JSON files with _type json', async () => {
    const items = await loadContentStore(contentDir, false)
    const products = items.find((i) => i._path === '/data/products')
    expect(products).toBeDefined()
    expect(products?._type).toBe('json')
    expect(JSON.parse(products?.body ?? '[]')).toEqual([{ id: 1 }])
  })
})
