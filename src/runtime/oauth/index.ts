export { handleOAuthInitiate, handleOAuthCallback, handleOAuthLogout } from './handler.js'
export type { AuthUser, ResolvedAuthConfig } from './handler.js'
export { OAUTH_PROVIDERS } from './providers.js'
export type { OAuthEndpoints } from './providers.js'

/**
 * Type-safe helper for declaring an OAuth provider in `cer.config.ts`.
 * Returns the config unchanged — exists purely for TypeScript inference.
 *
 * Built-in providers (`google`, `github`, `discord`) only require `clientId`
 * and `clientSecret`.  You can override any endpoint URL or supply a custom
 * `scope` array.  For a provider not listed in `OAUTH_PROVIDERS` you must
 * supply all three endpoint URLs (`authorizationUrl`, `tokenUrl`,
 * `userInfoUrl`).
 *
 * @example
 * ```ts
 * // cer.config.ts
 * import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'
 *
 * export default defineConfig({
 *   auth: {
 *     providers: {
 *       google: defineOAuthProvider({
 *         clientId: process.env.GOOGLE_CLIENT_ID!,
 *         clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
 *       }),
 *       github: defineOAuthProvider({
 *         clientId: process.env.GITHUB_CLIENT_ID!,
 *         clientSecret: process.env.GITHUB_CLIENT_SECRET!,
 *         scope: ['read:user', 'user:email', 'read:org'],
 *       }),
 *     },
 *     redirectAfterLogin: '/dashboard',
 *     redirectAfterLogout: '/',
 *   },
 * })
 * ```
 */
export function defineOAuthProvider<T extends {
  clientId: string
  clientSecret: string
  scope?: string[]
  authorizationUrl?: string
  tokenUrl?: string
  userInfoUrl?: string
}>(config: T): T {
  return config
}
