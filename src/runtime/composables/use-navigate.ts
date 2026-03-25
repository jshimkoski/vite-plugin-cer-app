/**
 * navigateTo — programmatic navigation.
 *
 * Works isomorphically:
 * - **Server context** (inside a loader or middleware): sends a 302 redirect
 *   immediately by writing to the current request's `res` object via
 *   `AsyncLocalStorage`. The response is ended and the function returns.
 * - **Client context**: delegates to the framework router so the SPA
 *   navigation pipeline (middleware, loaders, isNavigating) runs normally.
 *   Falls back to `window.location.href` if the router is not available.
 *
 * @example
 * ```ts
 * // app/middleware/require-auth.ts
 * export default defineMiddleware(() => {
 *   const { loggedIn } = useAuth()
 *   if (!loggedIn) return navigateTo('/login')
 * })
 * ```
 *
 * @example
 * ```ts
 * // app/pages/dashboard.ts
 * component('page-dashboard', () => {
 *   useOnConnected(() => {
 *     if (someCondition) navigateTo('/home')
 *   })
 * })
 * ```
 */

export function navigateTo(path: string): void | Promise<void> {
  const g = globalThis as Record<string, unknown>

  // Server: redirect via the request-scoped req/res store.
  const reqStore = g['__CER_REQ_STORE__'] as {
    getStore(): { res: { statusCode: number; setHeader(k: string, v: string): void; end(): void; writableEnded?: boolean } } | null
  } | undefined

  if (reqStore) {
    const store = reqStore.getStore()
    if (store?.res && !store.res.writableEnded) {
      store.res.statusCode = 302
      store.res.setHeader('Location', path)
      store.res.end()
      return
    }
  }

  // Client: use the framework router so the full navigation pipeline runs.
  const router = g['__cerRouter'] as { push(path: string): Promise<void> } | undefined
  if (router) return router.push(path)

  // Fallback: hard redirect.
  if (typeof window !== 'undefined') {
    window.location.href = path
  }
}
