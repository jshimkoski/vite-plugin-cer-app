export function matchRoutePattern(pattern: string, urlPath: string): boolean {
  const norm = (s: string): string => s.replace(/\/+$/, '') || '/'
  if (norm(pattern) === norm(urlPath)) return true
  const regexStr = '^' + norm(pattern).split('/').map((segment, index) => {
    if (/^:[^/]+\*$/.test(segment)) return index ? '(?:/.*)?' : '.*'
    const prefix = index ? '/' : ''
    if (segment.startsWith(':')) return prefix + '[^/]+'
    return prefix + segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('') + '$'

  return new RegExp(regexStr).test(norm(urlPath))
}

/**
 * Returns the per-route `render` strategy ('static' | 'server' | 'spa') for
 * the route that best matches `urlPath`, or `null` when no route matches or
 * none declares a render mode.
 */
export function findRenderMode(
  routes: Array<{ path: string; meta?: Record<string, unknown> }>,
  urlPath: string,
): 'static' | 'server' | 'spa' | null {
  for (const route of routes) {
    if (matchRoutePattern(route.path, urlPath)) {
      const render = route.meta?.render
      if (render === 'static' || render === 'server' || render === 'spa') return render
      return null
    }
  }
  return null
}

/**
 * Looks up the `meta.ssg.revalidate` TTL (in seconds) for the route that best
 * matches `urlPath`. Returns `null` when no route matches or none defines
 * `revalidate`.
 */
export function findRevalidate(
  routes: Array<{ path: string; meta?: Record<string, unknown> }>,
  urlPath: string,
): number | null {
  for (const route of routes) {
    if (matchRoutePattern(route.path, urlPath)) {
      const ssg = route.meta?.ssg as Record<string, unknown> | undefined
      return typeof ssg?.revalidate === 'number' ? ssg.revalidate : null
    }
  }
  return null
}

