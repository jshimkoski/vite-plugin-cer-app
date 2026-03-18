import fg from 'fast-glob'
import type { FSWatcher } from 'vite'

/**
 * Scans a directory for files matching the given glob pattern.
 * Returns absolute file paths sorted alphabetically.
 */
export async function scanDirectory(pattern: string, cwd: string): Promise<string[]> {
  const files = await fg(pattern, {
    cwd,
    absolute: true,
    onlyFiles: true,
    ignore: ['**/node_modules/**', '**/.git/**'],
  })
  return files.sort()
}

/**
 * Creates a file watcher for the given directories using Vite's built-in watcher.
 * Calls `onChange(event, absoluteFilePath)` on add/unlink events.
 *
 * @param watcher - The FSWatcher from Vite's dev server (server.watcher)
 * @param dirs - Absolute directory paths to watch
 * @param onChange - Callback invoked with event type and absolute file path
 * @returns A cleanup function that removes the listeners
 */
export function createWatcher(
  watcher: FSWatcher,
  dirs: string[],
  onChange: (event: string, file: string) => void,
): () => void {
  // Add directories to Vite's watcher
  for (const dir of dirs) {
    watcher.add(dir)
  }

  const handleAdd = (file: string) => {
    if (dirs.some((dir) => file.startsWith(dir))) {
      onChange('add', file)
    }
  }

  const handleUnlink = (file: string) => {
    if (dirs.some((dir) => file.startsWith(dir))) {
      onChange('unlink', file)
    }
  }

  const handleChange = (file: string) => {
    if (dirs.some((dir) => file.startsWith(dir))) {
      onChange('change', file)
    }
  }

  watcher.on('add', handleAdd)
  watcher.on('unlink', handleUnlink)
  watcher.on('change', handleChange)

  // Return cleanup function
  return () => {
    watcher.off('add', handleAdd)
    watcher.off('unlink', handleUnlink)
    watcher.off('change', handleChange)
  }
}
