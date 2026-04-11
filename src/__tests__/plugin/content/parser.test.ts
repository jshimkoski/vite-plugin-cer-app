import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { parseContentFile } from '../../../plugin/content/parser.js'
import type { ContentFile } from '../../../plugin/content/scanner.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir: string
let contentDir: string

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cer-content-parser-'))
  contentDir = join(tmpDir, 'content')
  mkdirSync(contentDir, { recursive: true })
  mkdirSync(join(contentDir, 'blog'), { recursive: true })
  mkdirSync(join(contentDir, 'data'), { recursive: true })

  writeFileSync(join(contentDir, 'index.md'), `---
title: Home
description: Welcome home
---

# Home

Body content.
`)

  writeFileSync(join(contentDir, 'about.md'), `---
title: About
date: 2026-04-01
draft: false
tags: [web]
---

# About

## Section One

Content here.
`)

  writeFileSync(join(contentDir, 'blog', 'hello.md'), `---
title: Hello World
description: My first post
date: 2026-04-03
---

Intro paragraph.

<!-- more -->

Rest of the body.
`)

  writeFileSync(join(contentDir, 'blog', 'no-excerpt.md'), `---
title: No Excerpt
---

Just content, no more marker.
`)

  writeFileSync(join(contentDir, 'data', 'products.json'), JSON.stringify([{ id: 1, name: 'Widget' }]))

  // ── Fallback fixtures ────────────────────────────────────────────────────
  // No frontmatter at all — title and description derived from body
  writeFileSync(join(contentDir, 'no-frontmatter.md'), `# Derived Title

First paragraph for description.

Second paragraph.
`)

  // Frontmatter title only — description derived from body
  writeFileSync(join(contentDir, 'title-only.md'), `---
title: Explicit Title
---

Description will come from this paragraph.
`)

  // Frontmatter description only — title derived from h1
  writeFileSync(join(contentDir, 'desc-only.md'), `---
description: Explicit description
---

# Derived H1 Title

Some paragraph.
`)

  // Both set in frontmatter — body values must NOT overwrite them
  writeFileSync(join(contentDir, 'both-frontmatter.md'), `---
title: FM Title
description: FM Description
---

# Different H1

Different paragraph.
`)

  // h1 with inline formatting — plain text only
  writeFileSync(join(contentDir, 'formatted-h1.md'), `# Hello **World**

Some intro.
`)

  // Long paragraph — description truncated to 160 chars + ellipsis
  writeFileSync(join(contentDir, 'long-para.md'), `# Long

${'A'.repeat(200)}
`)

  // No h1, only h2 — title fallback must remain undefined
  writeFileSync(join(contentDir, 'no-h1.md'), `## Section Only

A paragraph here.
`)
})

function makeFile(filePath: string, ext: 'md' | 'json'): ContentFile {
  return { filePath, ext }
}

// ─── Markdown parsing ─────────────────────────────────────────────────────────

describe('parseContentFile — Markdown', () => {
  it('returns correct _path for index.md', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'index.md'), 'md'), contentDir)
    expect(item._path).toBe('/')
  })

  it('sets _type to markdown', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'index.md'), 'md'), contentDir)
    expect(item._type).toBe('markdown')
  })

  it('sets _file relative to contentDir', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'about.md'), 'md'), contentDir)
    expect(item._file).toBe('about.md')
  })

  it('extracts frontmatter fields', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'about.md'), 'md'), contentDir)
    expect(item.title).toBe('About')
    // gray-matter parses YAML date strings as Date objects; verify date truthy and correct type
    expect(item.date).toBeTruthy()
    expect(item.draft).toBe(false)
    expect(item.tags).toEqual(['web'])
  })

  it('renders Markdown body to HTML', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'index.md'), 'md'), contentDir)
    expect(item.body).toContain('<h1')
    expect(item.body).toContain('Home')
  })

  it('extracts headings into toc', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'about.md'), 'md'), contentDir)
    expect(Array.isArray(item.toc)).toBe(true)
    const h1 = item.toc.find((h) => h.depth === 1)
    const h2 = item.toc.find((h) => h.depth === 2)
    expect(h1).toBeDefined()
    expect(h2).toBeDefined()
    expect(h2?.text).toBe('Section One')
    expect(h2?.id).toBe('section-one')
  })

  it('adds id attributes to headings in body HTML', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'about.md'), 'md'), contentDir)
    expect(item.body).toContain('id="section-one"')
  })

  it('toc id matches heading id attribute in body', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'about.md'), 'md'), contentDir)
    for (const h of item.toc) {
      expect(item.body).toContain(`id="${h.id}"`)
    }
  })

  it('sets excerpt when <!-- more --> marker is present', () => {
    const item = parseContentFile(
      makeFile(join(contentDir, 'blog', 'hello.md'), 'md'),
      contentDir,
    )
    expect(item.excerpt).toBeDefined()
    expect(item.excerpt).toContain('Intro paragraph')
    expect(item.excerpt).not.toContain('Rest of the body')
  })

  it('excerpt is absent when no <!-- more --> marker', () => {
    const item = parseContentFile(
      makeFile(join(contentDir, 'blog', 'no-excerpt.md'), 'md'),
      contentDir,
    )
    expect(item.excerpt).toBeUndefined()
  })

  it('body contains full content including text after <!-- more -->', () => {
    const item = parseContentFile(
      makeFile(join(contentDir, 'blog', 'hello.md'), 'md'),
      contentDir,
    )
    expect(item.body).toContain('Intro paragraph')
    expect(item.body).toContain('Rest of the body')
    // The <!-- more --> marker itself must not appear in the rendered body HTML
    expect(item.body).not.toContain('<!-- more -->')
  })
})

// ─── JSON parsing ─────────────────────────────────────────────────────────────

describe('parseContentFile — JSON', () => {
  it('sets _type to json', () => {
    const item = parseContentFile(
      makeFile(join(contentDir, 'data', 'products.json'), 'json'),
      contentDir,
    )
    expect(item._type).toBe('json')
  })

  it('sets body to raw JSON string', () => {
    const item = parseContentFile(
      makeFile(join(contentDir, 'data', 'products.json'), 'json'),
      contentDir,
    )
    expect(JSON.parse(item.body)).toEqual([{ id: 1, name: 'Widget' }])
  })

  it('sets toc to empty array', () => {
    const item = parseContentFile(
      makeFile(join(contentDir, 'data', 'products.json'), 'json'),
      contentDir,
    )
    expect(item.toc).toEqual([])
  })

  it('sets correct _path for json file', () => {
    const item = parseContentFile(
      makeFile(join(contentDir, 'data', 'products.json'), 'json'),
      contentDir,
    )
    expect(item._path).toBe('/data/products')
  })

  it('throws a descriptive error for invalid JSON', () => {
    const badFile = join(contentDir, 'data', 'bad.json')
    writeFileSync(badFile, '{not valid json}')
    expect(() =>
      parseContentFile(makeFile(badFile, 'json'), contentDir),
    ).toThrow(/Invalid JSON/)
  })
})

// ─── toContentMeta ────────────────────────────────────────────────────────────

describe('toContentMeta', () => {
  it('strips _file, body, toc, excerpt from ContentItem', async () => {
    const { toContentMeta } = await import('../../../plugin/content/parser.js')
    const item = parseContentFile(
      makeFile(join(contentDir, 'blog', 'hello.md'), 'md'),
      contentDir,
    )
    const meta = toContentMeta(item)
    expect('_file' in meta).toBe(false)
    expect('body' in meta).toBe(false)
    expect('toc' in meta).toBe(false)
    expect('excerpt' in meta).toBe(false)
    expect(meta._path).toBe('/blog/hello')
    expect(meta.title).toBe('Hello World')
  })
})

// ─── Date normalisation ───────────────────────────────────────────────────────

describe('parseContentFile — date normalisation', () => {
  it('converts a gray-matter Date object to a YYYY-MM-DD string', () => {
    // gray-matter parses `date: 2026-04-01` as a JS Date object.
    // The parser must normalise it to a string so the in-memory server store and
    // the client (after JSON round-trip) are consistent.
    const item = parseContentFile(makeFile(join(contentDir, 'about.md'), 'md'), contentDir)
    expect(typeof item.date).toBe('string')
    expect(item.date as string).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('normalised date string is comparable with other ISO date strings', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'about.md'), 'md'), contentDir)
    const date = item.date as string
    // Verify that where-predicate comparisons work correctly post-normalisation
    expect(date >= '2026-01-01').toBe(true)
    expect(date < '2027-01-01').toBe(true)
  })
})

// ─── Fallback title / description ────────────────────────────────────────────

describe('parseContentFile — fallback title from h1', () => {
  it('derives title from h1 when frontmatter title is absent', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'no-frontmatter.md'), 'md'), contentDir)
    expect(item.title).toBe('Derived Title')
  })

  it('frontmatter title is not overwritten when present', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'title-only.md'), 'md'), contentDir)
    expect(item.title).toBe('Explicit Title')
  })

  it('derives title from h1 when only description is in frontmatter', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'desc-only.md'), 'md'), contentDir)
    expect(item.title).toBe('Derived H1 Title')
  })

  it('frontmatter title wins over h1 when both set', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'both-frontmatter.md'), 'md'), contentDir)
    expect(item.title).toBe('FM Title')
  })

  it('strips inline formatting — title is plain text', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'formatted-h1.md'), 'md'), contentDir)
    expect(item.title).toBe('Hello World')
  })

  it('does not derive title from h2 — must be h1 only', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'no-h1.md'), 'md'), contentDir)
    expect(item.title).toBeUndefined()
  })
})

describe('parseContentFile — fallback description from first paragraph', () => {
  it('derives description from first paragraph when frontmatter description is absent', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'no-frontmatter.md'), 'md'), contentDir)
    expect(item.description).toBe('First paragraph for description.')
  })

  it('frontmatter description is not overwritten when present', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'desc-only.md'), 'md'), contentDir)
    expect(item.description).toBe('Explicit description')
  })

  it('derives description from first paragraph when only title is in frontmatter', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'title-only.md'), 'md'), contentDir)
    expect(item.description).toBe('Description will come from this paragraph.')
  })

  it('frontmatter description wins when both set', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'both-frontmatter.md'), 'md'), contentDir)
    expect(item.description).toBe('FM Description')
  })

  it('truncates long paragraphs to 160 chars with ellipsis', () => {
    const item = parseContentFile(makeFile(join(contentDir, 'long-para.md'), 'md'), contentDir)
    expect(typeof item.description).toBe('string')
    expect((item.description as string).length).toBeLessThanOrEqual(164) // 160 + '…' (3 bytes)
    expect(item.description as string).toMatch(/…$/)
  })

  it('derived description is on ContentMeta (present in manifest)', async () => {
    const { toContentMeta } = await import('../../../plugin/content/parser.js')
    const item = parseContentFile(makeFile(join(contentDir, 'no-frontmatter.md'), 'md'), contentDir)
    const meta = toContentMeta(item)
    expect(meta.description).toBe('First paragraph for description.')
  })
})

describe('parseContentFile — JSON fallback', () => {
  it('does not apply title/description fallbacks to JSON files', () => {
    // JSON files have no markdown body to extract from
    const item = parseContentFile(
      makeFile(join(contentDir, 'data', 'products.json'), 'json'),
      contentDir,
    )
    expect(item.title).toBeUndefined()
    expect(item.description).toBeUndefined()
  })
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})
