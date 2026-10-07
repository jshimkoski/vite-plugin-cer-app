import { readFileSync } from 'node:fs'
import { join, resolve } from 'pathe'
import { contentPathToFile } from './content/emitter.js'
import type { ContentItem, ContentMeta } from '../types/content.js'

/** Embed the client build's exact published content snapshot into the server graph. */
export function serverContentSource(clientDir: string): string {
  const contentDir = join(clientDir, '_content')
  let manifest: ContentMeta[]
  try { manifest = JSON.parse(readFileSync(join(contentDir, 'manifest.json'), 'utf8')) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    manifest = []
  }
  const items: ContentItem[] = manifest.map((meta) => {
    const file = resolve(contentDir, contentPathToFile(meta._path))
    if (!file.startsWith(resolve(contentDir) + '/')) throw new Error('Content path escapes the content directory')
    return JSON.parse(readFileSync(file, 'utf8')) as ContentItem
  })
  // JSON.parse preserves arbitrary content keys without object-literal __proto__ semantics.
  return `globalThis.__CER_CONTENT_STORE__ = JSON.parse(${JSON.stringify(JSON.stringify(items))});\n`
}
