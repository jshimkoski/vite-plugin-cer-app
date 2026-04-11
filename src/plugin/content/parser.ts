import matter from 'gray-matter'
import { marked, type Token } from 'marked'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { ContentHeading, ContentItem, ContentMeta } from '../../types/content.js'
import type { ContentFile } from './scanner.js'
import { fileToContentPath } from './path-utils.js'
import { relative } from 'pathe'

// ─── Heading extraction ───────────────────────────────────────────────────────

/** Slugify a plain-text heading string into a URL-safe id. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
}

/**
 * Walks a marked token list and collects heading tokens.
 * Mutates heading tokens in place to add `id` attributes to the HTML output.
 */
function extractHeadings(tokens: Token[]): ContentHeading[] {
  const headings: ContentHeading[] = []

  const walk = (tokenList: Token[]) => {
    for (const token of tokenList) {
      if (token.type === 'heading') {
        const text = token.text
        const id = slugify(text)
        headings.push({
          depth: token.depth as ContentHeading['depth'],
          id,
          text,
        })
      }
      // Walk nested tokens (e.g. list items, blockquote)
      if ('tokens' in token && Array.isArray(token.tokens)) {
        walk(token.tokens)
      }
    }
  }

  walk(tokens)
  return headings
}

// ─── Fallback title / description extraction ─────────────────────────────────

/**
 * Converts a list of inline marked tokens to plain text by recursing into
 * formatted tokens (strong, em, link, etc.) and collecting their leaf text.
 * Used to derive readable fallback values from body content.
 */
function inlineToPlainText(tokens: Token[]): string {
  let result = ''
  for (const t of tokens) {
    const children = (t as { tokens?: Token[] }).tokens
    if (Array.isArray(children) && children.length > 0) {
      result += inlineToPlainText(children)
    } else if (t.type === 'br') {
      result += ' '
    } else if ('text' in t && typeof (t as { text: string }).text === 'string') {
      result += (t as { text: string }).text
    }
  }
  return result
}

const DESCRIPTION_MAX_LEN = 160

/**
 * Scans the top-level token list for a fallback `title` (first depth-1 heading)
 * and `description` (first paragraph). Both are `undefined` when no matching
 * token is found.
 *
 * These are applied only when the corresponding frontmatter field is absent, so
 * frontmatter always wins.
 */
function extractFallbacks(tokens: Token[]): { title?: string; description?: string } {
  let title: string | undefined
  let description: string | undefined

  for (const token of tokens) {
    if (title === undefined && token.type === 'heading' && token.depth === 1) {
      const text = inlineToPlainText((token as { tokens: Token[] }).tokens ?? []).trim()
      if (text) title = text
    }
    if (description === undefined && token.type === 'paragraph') {
      const text = inlineToPlainText((token as { tokens: Token[] }).tokens ?? []).trim()
      if (text) {
        description =
          text.length > DESCRIPTION_MAX_LEN
            ? text.slice(0, DESCRIPTION_MAX_LEN).trimEnd() + '…'
            : text
      }
    }
    if (title !== undefined && description !== undefined) break
  }

  return { title, description }
}

// ─── Custom renderer: add id to heading tags ─────────────────────────────────

const renderer = new marked.Renderer()

renderer.heading = function ({ tokens, depth }) {
  const text = tokens.map((t) => ('text' in t ? (t.text as string) : '')).join('')
  const id = slugify(text)
  const level = depth as ContentHeading['depth']
  const innerHtml = marked.parseInline(tokens.map((t) => ('raw' in t ? t.raw : '')).join(''))
  return `<h${level} id="${id}">${innerHtml}</h${level}>\n`
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Core parse logic shared by both the sync and async variants.
 * Accepts pre-read `raw` content so the caller controls I/O scheduling.
 *
 * Date normalization: gray-matter parses bare YAML dates (e.g. `date: 2026-04-03`)
 * as JavaScript `Date` objects. This causes a type mismatch — the in-memory server
 * store contains `Date` objects while the client, which reads via JSON.stringify/parse,
 * always gets ISO strings. All `Date` values are normalised to `YYYY-MM-DD` strings
 * here so both paths are consistent.
 */
function parseContentFileFromRaw(
  file: ContentFile,
  contentDir: string,
  raw: string,
): ContentItem {
  const _path = fileToContentPath(file.filePath, contentDir)
  const _file = relative(contentDir, file.filePath)

  if (file.ext === 'json') {
    // Validate JSON so users get a clear error at build time rather than a
    // silently broken body string that only surfaces at render time.
    try {
      JSON.parse(raw)
    } catch (err) {
      throw new Error(
        `Invalid JSON in content file "${file.filePath}": ${(err as Error).message}`,
      )
    }
    return {
      _path,
      _file,
      _type: 'json',
      body: raw,
      toc: [],
    }
  }

  // ── Markdown ─────────────────────────────────────────────────────────────
  const parsed = matter(raw)
  const frontmatter = parsed.data as ContentMeta
  const content = parsed.content

  // Split on <!-- more --> for excerpt.
  // The marker is stripped from bodySource so it does not appear as an HTML
  // comment in the rendered body — spec says body is "all content minus the
  // marker itself".
  const MORE_MARKER = '<!-- more -->'
  const moreIndex = content.indexOf(MORE_MARKER)
  const hasMore = moreIndex !== -1
  const bodySource = hasMore
    ? content.slice(0, moreIndex) + content.slice(moreIndex + MORE_MARKER.length)
    : content
  const excerptSource = hasMore ? content.slice(0, moreIndex).trim() : null

  // Tokenise once and extract headings
  const lexer = new marked.Lexer()
  const tokens = lexer.lex(bodySource)
  const toc = extractHeadings(tokens)

  // Render full body with custom renderer (adds id= to headings)
  const body = marked.parser(tokens, { renderer }) as string

  // Render excerpt if present
  const excerpt = excerptSource !== null
    ? (marked.parse(excerptSource, { renderer }) as string)
    : undefined

  // Derive fallback title / description from body tokens when frontmatter
  // does not provide them. Frontmatter always wins — these only fill gaps.
  const fallbacks = extractFallbacks(tokens)

  const item: ContentItem = {
    ...frontmatter,
    _path,
    _file,
    _type: 'markdown',
    body,
    toc,
  }

  if (item.title === undefined && fallbacks.title !== undefined) {
    item.title = fallbacks.title
  }
  if (item.description === undefined && fallbacks.description !== undefined) {
    item.description = fallbacks.description
  }

  if (excerpt !== undefined) {
    item.excerpt = excerpt
  }

  // Normalise any Date objects introduced by gray-matter's YAML parser to
  // YYYY-MM-DD strings. Without this, the server in-memory store holds Date
  // objects while the client (after JSON round-trip) holds strings, causing
  // date comparisons in .where() predicates to silently misbehave server-side.
  for (const key of Object.keys(item)) {
    if ((item as Record<string, unknown>)[key] instanceof Date) {
      ;(item as Record<string, unknown>)[key] = ((item as Record<string, unknown>)[key] as Date)
        .toISOString()
        .split('T')[0]
    }
  }

  return item
}

/**
 * Parses a single content file synchronously and returns a `ContentItem`.
 * Prefer `parseContentFileAsync` in batch contexts (e.g. `loadContentStore`)
 * to allow concurrent I/O.
 */
export function parseContentFile(
  file: ContentFile,
  contentDir: string,
): ContentItem {
  const raw = readFileSync(file.filePath, 'utf-8')
  return parseContentFileFromRaw(file, contentDir, raw)
}

/**
 * Async variant of `parseContentFile`. Uses `fs/promises.readFile` so multiple
 * calls can be awaited concurrently via `Promise.all`, overlapping disk I/O.
 */
export async function parseContentFileAsync(
  file: ContentFile,
  contentDir: string,
): Promise<ContentItem> {
  const raw = await readFile(file.filePath, 'utf-8')
  return parseContentFileFromRaw(file, contentDir, raw)
}

/**
 * Strips body-only fields to produce a lean `ContentMeta` for the manifest.
 */
export function toContentMeta(item: ContentItem): ContentMeta {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _file, body, toc, excerpt, ...meta } = item
  return meta as ContentMeta
}
