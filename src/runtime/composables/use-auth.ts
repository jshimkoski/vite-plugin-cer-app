import { useSession } from './use-session.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  provider: string
  id: string
  name?: string
  email?: string
  avatar?: string
  [key: string]: unknown
}

export interface AuthComposable {
  /** The currently authenticated user, or `null` if not logged in. */
  readonly user: AuthUser | null
  /** `true` when a user is authenticated. */
  readonly loggedIn: boolean
  /**
   * Initiates an OAuth login flow by redirecting to `/api/auth/:provider`.
   * Only meaningful on the client — calling this on the server is a no-op.
   */
  login(provider: string): void
  /**
   * Logs out the current user.
   *
   * - **Server context** (inside a loader / middleware): clears the auth
   *   session cookie immediately via `useSession().clear()`.
   * - **Client context**: redirects to `/api/auth/logout` which clears the
   *   cookie server-side and redirects to `redirectAfterLogout`.
   */
  logout(): Promise<void>
}

// ─── Composable ───────────────────────────────────────────────────────────────

/**
 * Returns the currently authenticated user and helpers for login/logout.
 *
 * Works isomorphically:
 * - **Server render pass** — reads from `globalThis.__CER_AUTH_STORE__`
 *   (AsyncLocalStorage populated by the entry-server handler before rendering).
 * - **Client hydration** — reads from `globalThis.__CER_AUTH_USER__` (injected
 *   as `window.__CER_AUTH_USER__` by the entry-server and captured by the
 *   client entry before the app boots).
 *
 * @param sessionKey - Session cookie name; must match `auth.sessionKey` in
 *   `cer.config.ts` (defaults to `'auth'`).
 *
 * @example
 * ```ts
 * // app/pages/profile.ts
 * component('page-profile', () => {
 *   const { user, loggedIn, logout } = useAuth()
 *
 *   if (!loggedIn) {
 *     // Redirect to login
 *     useHead({ title: 'Login required' })
 *   }
 * })
 * ```
 *
 * @example
 * ```ts
 * // app/middleware/require-auth.ts
 * export default defineMiddleware((to) => {
 *   const { loggedIn } = useAuth()
 *   if (!loggedIn) return '/login'
 *   return true
 * })
 * ```
 */
export function useAuth(sessionKey = 'auth'): AuthComposable {
  const g = globalThis as Record<string, unknown>

  // Server: read from the per-request AsyncLocalStorage context.
  // __CER_AUTH_STORE__ is only present in Node.js (tree-shaken on client).
  const authStore = g['__CER_AUTH_STORE__'] as { getStore(): unknown } | undefined
  let user: AuthUser | null = null

  if (authStore) {
    user = (authStore.getStore() as AuthUser | null) ?? null
  } else {
    // Client: read from the global hydrated by the client entry.
    user = (g['__CER_AUTH_USER__'] as AuthUser | null) ?? null
  }

  return {
    get user() {
      return user
    },

    get loggedIn() {
      return user !== null
    },

    login(provider: string) {
      if (typeof window !== 'undefined') {
        window.location.href = `/api/auth/${provider}`
      }
    },

    async logout() {
      if (typeof window !== 'undefined') {
        // Client: let the server clear the cookie via the logout route.
        window.location.href = '/api/auth/logout'
      } else {
        // Server context: clear the session cookie directly.
        const session = useSession({ name: sessionKey })
        await session.clear()
        // Also clear the local user reference so the current render sees null.
        user = null
        // Clear the ALS store value so concurrent requests are unaffected.
        const store = (g['__CER_AUTH_STORE__'] as { enterWith(v: unknown): void } | undefined)
        if (store) store.enterWith(null)
      }
    },
  }
}
