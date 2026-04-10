import { describe, it, expect } from 'vitest'
import { contentPathToFile, emitContentFiles } from '../../../plugin/content/emitter.js'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import type { ContentItem } from '../../../types/content.js'

// ─── contentPathToFile ────────────────────────────────────────────────────────

describe('contentPathToFile', () => {
  it('maps / to index.json', () => {
    expect(contentPathToFile('/')).toBe('index.json')
  })

  it('maps /about to about.json', () => {
    expect(contentPathToFile('/about')).toBe('about.json')
  })

  it('maps /blog/hello to blog/hello.json', () => {
    expect(contentPathToFile('/blog/hello')).toBe('blog/hello.json')
  })

  it('maps /blog to blog.json', () => {
    expect(contentPathToFile('/blog')).toBe('blog.json')
  })

  it('maps /docs/getting-started to docs/getting-started.json', () => {
    expect(contentPathToFile('/docs/getting-started')).toBe('docs/getting-started.json')
  })
})

// ─── emitContentFiles ─────────────────────────────────────────────────────────

describe('emitContentFiles', () => {
  const items: ContentItem[] = [
    {
      _path: '/',
      _file: 'index.md',
      _type: 'markdown',
      title: 'Home',
      description: 'Welcome',
      body: '<h1>Home</h1>',
      toc: [],
    },
    {
      _path: '/blog/hello',
      _file: 'blog/hello.md',
      _type: 'markdown',
      title: 'Hello',
      description: 'First post',
      date: '2026-04-03',
      draft: false,
      body: '<h1>Hello</h1>',
      toc: [{ depth: 1, id: 'hello', text: 'Hello' }],
      excerpt: '<p>Intro</p>',
    },
  ]

  it('writes manifest.json with lean ContentMeta (no body/toc/excerpt/_file)', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'cer-emitter-'))
    emitContentFiles(items, outDir, '{}')
    const manifest = JSON.parse(readFileSync(join(outDir, '_content/manifest.json'), 'utf-8'))
    expect(Array.isArray(manifest)).toBe(true)
    expect(manifest).toHaveLength(2)
    const root = manifest.find((m: { _path: string }) => m._path === '/')
    expect(root.title).toBe('Home')
    expect('body' in root).toBe(false)
    expect('toc' in root).toBe(false)
    expect('excerpt' in root).toBe(false)
    expect('_file' in root).toBe(false)
  })

  it('writes search-index.json with provided content', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'cer-emitter-'))
    emitContentFiles(items, outDir, '{"test":true}')
    const idx = JSON.parse(readFileSync(join(outDir, '_content/search-index.json'), 'utf-8'))
    expect(idx).toEqual({ test: true })
  })

  it('writes root document to _content/index.json', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'cer-emitter-'))
    emitContentFiles(items, outDir, '{}')
    expect(existsSync(join(outDir, '_content/index.json'))).toBe(true)
    const doc = JSON.parse(readFileSync(join(outDir, '_content/index.json'), 'utf-8'))
    expect(doc._path).toBe('/')
    expect(doc.body).toBe('<h1>Home</h1>')
  })

  it('writes nested document to correct subdirectory', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'cer-emitter-'))
    emitContentFiles(items, outDir, '{}')
    const docPath = join(outDir, '_content/blog/hello.json')
    expect(existsSync(docPath)).toBe(true)
    const doc = JSON.parse(readFileSync(docPath, 'utf-8'))
    expect(doc._path).toBe('/blog/hello')
    expect(doc.toc).toEqual([{ depth: 1, id: 'hello', text: 'Hello' }])
    expect(doc.excerpt).toBe('<p>Intro</p>')
  })

  it('coexisting blog.json and blog/ dir is allowed', () => {
    const items2: ContentItem[] = [
      ...items,
      {
        _path: '/blog',
        _file: 'blog/index.md',
        _type: 'markdown',
        title: 'Blog',
        body: '<p>Blog</p>',
        toc: [],
      },
    ]
    const outDir = mkdtempSync(join(tmpdir(), 'cer-emitter-'))
    emitContentFiles(items2, outDir, '{}')
    expect(existsSync(join(outDir, '_content/blog.json'))).toBe(true)
    expect(existsSync(join(outDir, '_content/blog/hello.json'))).toBe(true)
  })
})
