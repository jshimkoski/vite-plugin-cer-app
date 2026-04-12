import { relative } from 'pathe'

function stripNumericPrefix(segment: string): string {
  return segment.replace(/^\d+\./, '')
}

/**
 * Maps a content file path to a `_path` URL path.
 *
 * Rules:
 * - Strip the content dir prefix
 * - Strip the file extension
 * - Strip `NN.` numeric ordering prefixes from all path segments
 * - Strip `/index` suffix (so blog/index.md → /blog)
 * - Strip `YYYY-MM-DD-` date prefix from the final slug segment
 *
 * Examples:
 *   index.md                → /
 *   01.about.md             → /about
 *   about.md                → /about
 *   01.blog/02.hello.md     → /blog/hello
 *   blog/index.md           → /blog
 *   blog/2026-04-03-hello.md → /blog/hello
 *   docs/getting-started.md  → /docs/getting-started
 *   data/products.json       → /data/products
 */
export function fileToContentPath(filePath: string, contentDir: string): string {
  // Get path relative to contentDir, strip extension
  let rel = relative(contentDir, filePath)
  rel = rel.replace(/\.(md|json)$/, '')

  // Split into segments
  const segments = rel.split('/').map(stripNumericPrefix)

  // Strip date prefix (YYYY-MM-DD-) from the last segment after removing any
  // numeric ordering prefix (for example 01.2026-04-03-hello.md → /hello).
  const last = segments[segments.length - 1]
  const stripped = last.replace(/^\d{4}-\d{2}-\d{2}-/, '')
  segments[segments.length - 1] = stripped

  // Strip trailing 'index' segment (but keep bare 'index' → '/')
  if (segments.length > 1 && segments[segments.length - 1] === 'index') {
    segments.pop()
  }

  // If the only segment was 'index', produce root path
  if (segments.length === 1 && segments[0] === 'index') {
    return '/'
  }

  const path = '/' + segments.join('/')
  return path.replace(/\/+/g, '/')
}


