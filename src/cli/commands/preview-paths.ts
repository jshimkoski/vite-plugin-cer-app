import { resolve, join } from 'pathe'
export { findRenderMode } from '../../runtime/route-matching.js'
export function isPathBounded(rootDir: string, urlPath: string): boolean {
  const safeRoot = resolve(rootDir)
  const resolved = resolve(join(rootDir, urlPath))
  return resolved === safeRoot || resolved.startsWith(safeRoot + '/')
}

