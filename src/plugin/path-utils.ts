import { basename, dirname, join, relative } from 'pathe'

export interface RouteEntry {
  filePath: string
  routePath: string
  tagName: string
  isDynamic: boolean
  isCatchAll: boolean
}

/**
 * Converts a file path to a route path.
 * e.g. app/pages/blog/[slug].ts -> /blog/:slug
 */
export function fileToRoutePath(filePath: string, pagesRoot: string): string {
  // Get path relative to pagesRoot, strip extension
  let rel = relative(pagesRoot, filePath)
  rel = rel.replace(/\.[jt]s$/, '')

  // Split into segments
  const segments = rel.split('/')

  const transformed: string[] = []
  for (const seg of segments) {
    // Strip route groups: (groupName)
    if (/^\(.*\)$/.test(seg)) {
      continue
    }

    // index becomes empty string (handled by parent)
    if (seg === 'index') {
      continue
    }

    // [...rest] -> :rest*  (named splat so the param is accessible in components)
    const catchAllMatch = seg.match(/^\[\.\.\.(.+)\]$/)
    if (catchAllMatch) {
      transformed.push(`:${catchAllMatch[1]}*`)
      continue
    }

    // [param] -> :param
    const dynamicMatch = seg.match(/^\[(.+)\]$/)
    if (dynamicMatch) {
      transformed.push(`:${dynamicMatch[1]}`)
      continue
    }

    transformed.push(seg)
  }

  const path = '/' + transformed.join('/')
  // Normalize double slashes
  return path.replace(/\/+/g, '/')
}

/**
 * Converts a file path to a kebab-case custom element tag name.
 * e.g. app/pages/blog/[slug].ts -> page-blog-slug
 */
export function fileToTagName(filePath: string, pagesRoot: string): string {
  let rel = relative(pagesRoot, filePath)
  rel = rel.replace(/\.[jt]s$/, '')

  // Strip route groups
  const segments = rel.split('/').filter((seg) => !/^\(.*\)$/.test(seg))

  // Mirror fileToRoutePath: strip 'index' segments unless it's the only segment
  // e.g. blog/index.ts -> page-blog (not page-blog-index), index.ts -> page-index
  const tagSegments = segments
    .map((seg) => seg.replace(/\[/g, '').replace(/\]/g, '').replace(/\./g, ''))
    .filter((seg, _, arr) => !(seg === 'index' && arr.length > 1))

  // Prefix with 'page-'
  const name = 'page-' + tagSegments.join('-')
  // Collapse multiple dashes and convert to lowercase
  return name
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Converts a layout file path to a kebab-case custom element tag name.
 * e.g. app/layouts/default.ts -> layout-default
 */
export function fileToLayoutTagName(filePath: string, layoutsRoot: string): string {
  let rel = relative(layoutsRoot, filePath)
  rel = rel.replace(/\.[jt]s$/, '')

  const segments = rel.split('/')
  const name = 'layout-' + segments.join('-')
  return name
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Sorts routes: static first, then dynamic, then catch-all.
 */
export function sortRoutes(routes: RouteEntry[]): RouteEntry[] {
  return [...routes].sort((a, b) => {
    // Catch-all always last
    if (a.isCatchAll && !b.isCatchAll) return 1
    if (!a.isCatchAll && b.isCatchAll) return -1

    // Dynamic after static
    if (a.isDynamic && !b.isDynamic) return 1
    if (!a.isDynamic && b.isDynamic) return -1

    // Alphabetical among same type
    return a.routePath.localeCompare(b.routePath)
  })
}

/**
 * Determines if a route path contains dynamic segments.
 */
export function isRouteDynamic(routePath: string): boolean {
  return routePath.includes(':')
}

/**
 * Determines if a route path is a catch-all.
 */
export function isRouteCatchAll(routePath: string): boolean {
  return routePath.includes('*')
}

/**
 * Builds a full RouteEntry from a file path.
 */
export function buildRouteEntry(filePath: string, pagesRoot: string): RouteEntry {
  const routePath = fileToRoutePath(filePath, pagesRoot)
  const tagName = fileToTagName(filePath, pagesRoot)
  return {
    filePath,
    routePath,
    tagName,
    isDynamic: isRouteDynamic(routePath),
    isCatchAll: isRouteCatchAll(routePath),
  }
}

/**
 * Returns the layout name (key) from a layout file path.
 * e.g. app/layouts/default.ts -> 'default'
 */
export function fileToLayoutName(filePath: string, layoutsRoot: string): string {
  let rel = relative(layoutsRoot, filePath)
  rel = rel.replace(/\.[jt]s$/, '')
  return rel.replace(/\//g, '-').toLowerCase()
}

/**
 * Returns a safe JS identifier for a file path (for import aliases).
 */
export function fileToImportAlias(filePath: string, prefix: string = '_m'): string {
  const base = basename(filePath).replace(/\.[jt]s$/, '')
  const safe = base
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
  return `${prefix}_${safe}`
}

/**
 * Returns the numeric sort prefix from a filename (e.g. "01.store.ts" -> 1).
 * Returns Infinity if no numeric prefix.
 */
export function extractPluginOrder(fileName: string): number {
  const match = basename(fileName).match(/^(\d+)\./)
  return match ? parseInt(match[1], 10) : Infinity
}

/**
 * Sorts plugin files by leading numeric prefix then alphabetically.
 */
export function sortPluginFiles(files: string[]): string[] {
  return [...files].sort((a, b) => {
    const aOrder = extractPluginOrder(a)
    const bOrder = extractPluginOrder(b)
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.localeCompare(b)
  })
}
