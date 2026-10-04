import { scanFiles } from '../file-scanner.js'

export interface ContentFile {
  /** Absolute file path */
  filePath: string
  /** Extension without dot: 'md' | 'json' */
  ext: 'md' | 'json'
}

/**
 * Scans the content directory for all Markdown and JSON files.
 * Returns absolute file paths sorted alphabetically.
 */
export async function scanContentFiles(contentDir: string): Promise<ContentFile[]> {
  const files = await scanFiles(contentDir, ['.md', '.json'])

  return files.sort().map((filePath) => ({
    filePath,
    ext: filePath.endsWith('.json') ? 'json' : 'md',
  }))
}
