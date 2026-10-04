import { readdir, realpath, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'pathe'

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}

/** Discover source files without parsing glob expressions. Follow directory
 * symlinks, but stop cycles along each branch while preserving alias paths. */
export async function scanFiles(
  directory: string,
  extensions: readonly string[],
  ignoredDirectories: readonly string[] = ['node_modules', '.git'],
): Promise<string[]> {
  const files: string[] = []
  const allowedExtensions = new Set(extensions)
  const ignored = new Set(ignoredDirectories)

  async function visit(path: string, ancestors: ReadonlySet<string>): Promise<void> {
    try {
      const canonical = await realpath(path)
      if (ancestors.has(canonical)) return
      const nextAncestors = new Set(ancestors).add(canonical)
      for (const entry of await readdir(path, { withFileTypes: true })) {
        // Match fast-glob's default exclusion of dot files and directories.
        if (entry.name.startsWith('.')) continue
        const filePath = join(path, entry.name)
        if (entry.isSymbolicLink()) {
          try {
            const target = await stat(filePath)
            if (target.isDirectory()) {
              if (!ignored.has(entry.name)) await visit(filePath, nextAncestors)
            } else if (target.isFile() && allowedExtensions.has(extname(entry.name))) {
              files.push(filePath)
            }
          } catch (error) {
            if (!isMissing(error)) throw error
          }
          continue
        }
        if (entry.isDirectory()) {
          if (!ignored.has(entry.name)) await visit(filePath, nextAncestors)
        } else if (entry.isFile() && allowedExtensions.has(extname(entry.name))) {
          files.push(filePath)
        }
      }
    } catch (error) {
      // Optional source directories and dangling symlinks produce no matches.
      if (!isMissing(error)) throw error
    }
  }

  await visit(resolve(directory), new Set())
  return files.sort()
}
