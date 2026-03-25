/**
 * useRoute — returns the current route's path, params, query, and meta.
 *
 * Works isomorphically:
 * - **Server render pass** — reads from `globalThis.__CER_ROUTE_STORE__`
 *   (AsyncLocalStorage populated by the entry-server handler before rendering).
 * - **Client** — reads from the global router instance exposed by the app
 *   entry (`globalThis.__cerRouter`).
 *
 * @example
 * ```ts
 * // app/layouts/default.ts
 * component('layout-default', () => {
 *   const route = useRoute()
 *   return html`
 *     <nav>${route.meta?.title ?? 'My App'}</nav>
 *     <slot></slot>
 *   `
 * })
 * ```
 *
 * @example
 * ```ts
 * // app/pages/post.ts
 * component('page-post', () => {
 *   const { params } = useRoute()
 *   const { data: post } = useFetch(\`/api/posts/\${params.id}\`)
 * })
 * ```
 */

export interface RouteInfo {
  /** Current URL path, e.g. `'/posts/42'`. */
  path: string
  /** Dynamic route params, e.g. `{ id: '42' }`. */
  params: Record<string, string>
  /** Parsed query string params, e.g. `{ page: '2' }`. */
  query: Record<string, string>
  /** Static route meta object exported by the matched page module. */
  meta: Record<string, unknown> | null
}

export function useRoute(): RouteInfo {
  const g = globalThis as Record<string, unknown>

  // Server: read from the per-request AsyncLocalStorage context.
  const routeStore = g['__CER_ROUTE_STORE__'] as { getStore(): unknown } | undefined
  if (routeStore) {
    const info = routeStore.getStore() as RouteInfo | null
    if (info) return info
  }

  // Client: read from the global router set by the app entry.
  const router = g['__cerRouter'] as {
    getCurrent(): { path: string; query?: Record<string, string> }
    matchRoute(path: string): { route?: { meta?: unknown }; params?: Record<string, string> } | null
  } | undefined

  if (router) {
    const current = router.getCurrent()
    const matched = router.matchRoute(current.path)
    return {
      path: current.path,
      params: (matched?.params ?? {}) as Record<string, string>,
      query: (current.query ?? {}) as Record<string, string>,
      meta: (matched?.route?.meta as Record<string, unknown>) ?? null,
    }
  }

  return { path: '/', params: {}, query: {}, meta: null }
}
