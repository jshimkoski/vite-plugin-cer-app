import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'pathe'
import type { ContentItem, ContentMeta } from '../../types/content.js'
import { toContentMeta } from './parser.js'

/**
 * Converts a `_path` to the relative file path under `_content/`.
 *
 * Special case: `_path === '/'` writes to `_content/index.json` rather than
 * `_content/.json` (which would be invalid on most filesystems and confusing).
 */
export function contentPathToFile(path: string): string {
  if (path === '/') return 'index.json'
  // Remove leading slash, append .json
  return path.slice(1) + '.json'
}

/**
 * Writes all content output files to `<outDir>/_content/`:
 *
 * - `manifest.json`      — `ContentMeta[]` (no body, no toc, no excerpt)
 * - `search-index.json`  — serialised MiniSearch index string
 * - `[path].json`        — full `ContentItem` per document
 *
 * `router.base` is NOT prepended here — that is a client-side fetch concern.
 */
export function emitContentFiles(
  items: ContentItem[],
  outDir: string,
  searchIndexJson: string,
): void {
  const contentDir = join(outDir, '_content')
  mkdirSync(contentDir, { recursive: true })

  // manifest.json — lean metadata only
  const manifest: ContentMeta[] = items.map(toContentMeta)
  writeFileSync(join(contentDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8')

  // search-index.json
  writeFileSync(join(contentDir, 'search-index.json'), searchIndexJson, 'utf-8')

  // Per-document full JSON files
  for (const item of items) {
    const relFile = contentPathToFile(item._path)
    const absFile = join(contentDir, relFile)
    // Ensure subdirectory exists (e.g. _content/blog/ for _path: /blog/hello)
    mkdirSync(dirname(absFile), { recursive: true })
    writeFileSync(absFile, JSON.stringify(item), 'utf-8')
  }
}
