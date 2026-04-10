import fg from 'fast-glob'

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
  const files = await fg('**/*.{md,json}', {
    cwd: contentDir,
    absolute: true,
    onlyFiles: true,
    ignore: ['**/node_modules/**', '**/.git/**'],
  })

  return files.sort().map((filePath) => ({
    filePath,
    ext: filePath.endsWith('.json') ? 'json' : 'md',
  }))
}
