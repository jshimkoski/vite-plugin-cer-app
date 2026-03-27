import type { RouterConfig } from '@jasonshimmy/custom-elements-runtime/router'

// ─── OAuth / Auth types ───────────────────────────────────────────────────────

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  tokenType: string
}

export interface OAuthProviderConfig {
  /** OAuth application client ID. */
  clientId: string
  /** OAuth application client secret. Never serialized into the client bundle. */
  clientSecret: string
  /** Override the default OAuth scopes for this provider. */
  scope?: string[]
  /** Override the provider's authorization endpoint URL (custom/self-hosted providers). */
  authorizationUrl?: string
  /** Override the provider's token exchange endpoint URL. */
  tokenUrl?: string
  /** Override the provider's user-info endpoint URL. */
  userInfoUrl?: string
  /**
   * Transform the raw provider profile into the object stored in the auth session.
   * Return any serializable object — it becomes `useAuth().user` on both server and client.
   * If omitted the framework normalises the profile to `{ provider, id, name, email, avatar }`.
   */
  mapUser?: (profile: Record<string, unknown>, tokens: OAuthTokens) => Record<string, unknown>
}

export interface AuthConfig {
  /**
   * OAuth provider configurations keyed by provider name.
   * Built-in providers: `'google'`, `'github'`, `'discord'`.
   * Custom providers must supply `authorizationUrl`, `tokenUrl`, and `userInfoUrl`.
   */
  providers?: {
    google?: OAuthProviderConfig
    github?: OAuthProviderConfig
    discord?: OAuthProviderConfig
    [key: string]: OAuthProviderConfig | undefined
  }
  /** Path to redirect to after a successful login. Defaults to `'/'`. */
  redirectAfterLogin?: string
  /** Path to redirect to after logout. Defaults to `'/'`. */
  redirectAfterLogout?: string
  /**
   * Session cookie name used to store the authenticated user.
   * Defaults to `'auth'`. Must not collide with other `useSession()` names.
   */
  sessionKey?: string
}

export interface I18nConfig {
  /**
   * All supported locale codes. e.g. `['en', 'fr', 'de']`.
   */
  locales: string[]
  /**
   * The default locale. Used as the fallback when no locale is detected in the URL.
   */
  defaultLocale: string
  /**
   * URL strategy for locale routing.
   * - `'prefix'`                — every locale (including default) gets a URL prefix: `/en/about`, `/fr/about`
   * - `'prefix_except_default'` — default locale has no prefix (`/about`), others do (`/fr/about`). **Default.**
   * - `'no_prefix'`             — locale is not reflected in the URL (read from cookie or header only)
   */
  strategy?: 'prefix' | 'prefix_except_default' | 'no_prefix'
}

export interface SsgConfig {
  routes?: 'auto' | string[]
  concurrency?: number
  fallback?: boolean // fall back to SSR for unenumerated routes
}

export interface JitCssConfig {
  content?: string[]
  extendedColors?: boolean
}

export interface AutoImportsConfig {
  components?: boolean
  composables?: boolean
  directives?: boolean
  runtime?: boolean
}

export interface RuntimePublicConfig {
  [key: string]: unknown
}

export interface RuntimePrivateConfig {
  [key: string]: string
}

export interface RuntimeConfig {
  /**
   * Public runtime config — available on both server and client via
   * `useRuntimeConfig().public`. Values are serialized into the virtual module
   * at build time, so only use static/env-var values here.
   *
   * @example
   * runtimeConfig: {
   *   public: {
   *     apiBase: process.env.VITE_API_BASE ?? 'https://api.example.com',
   *   }
   * }
   */
  public?: RuntimePublicConfig
  /**
   * Server-only secrets — never serialized into the client bundle.
   * Declare keys with empty-string defaults here; at server startup each key
   * is resolved from `process.env[KEY]` (case-insensitive, ALL_CAPS preferred).
   *
   * @example
   * runtimeConfig: {
   *   private: { dbUrl: '', secretKey: '' },
   * }
   */
  private?: RuntimePrivateConfig
}

export interface CerAppConfig {
  mode?: 'spa' | 'ssr' | 'ssg'
  srcDir?: string // defaults to 'app'
  /**
   * Internationalisation (i18n) routing configuration.
   * When set, the framework generates locale-aware URL routes and enables `useLocale()`.
   *
   * @example
   * ```ts
   * i18n: {
   *   locales: ['en', 'fr', 'de'],
   *   defaultLocale: 'en',
   *   strategy: 'prefix_except_default',
   * }
   * ```
   */
  i18n?: I18nConfig
  ssg?: SsgConfig
  router?: Pick<RouterConfig, 'base' | 'scrollToFragment'>
  jitCss?: JitCssConfig
  autoImports?: AutoImportsConfig
  port?: number
  /**
   * Runtime configuration accessible via `useRuntimeConfig()`.
   * Only `public` values are exposed to the client; keep secrets
   * out of `public`.
   */
  runtimeConfig?: RuntimeConfig
  /**
   * Deployment platform adapter.
   * When set, `cer-app build` automatically runs the adapter after the build
   * completes, producing the platform-specific output alongside `dist/`.
   *
   * Built-in string values:
   * - `'vercel'`     — Vercel Build Output API v3 (`.vercel/output/`)
   * - `'netlify'`    — Netlify Functions v2 + `netlify.toml`
   * - `'cloudflare'` — Cloudflare Pages `_worker.js` + `wrangler.toml`
   *
   * Pass a function for a **custom adapter** (Railway, Fly.io, bare Node, Docker, …):
   * ```ts
   * adapter: async (root) => {
   *   // root is the absolute project root directory
   *   // dist/client/ and dist/server/ are already present after the build
   *   await myPlatformDeploy(root)
   * }
   * ```
   *
   * You can also run the built-in adapters independently with `cer-app adapt --platform <name>`.
   */
  adapter?: 'vercel' | 'netlify' | 'cloudflare' | ((root: string) => Promise<void>)
  /**
   * Authentication configuration.
   * Enables OAuth login flows via `useAuth()` and auto-generates
   * `/api/auth/:provider`, `/api/auth/callback/:provider`, and `/api/auth/logout` routes.
   *
   * @example
   * ```ts
   * import { defineConfig, defineOAuthProvider } from '@jasonshimmy/vite-plugin-cer-app'
   *
   * export default defineConfig({
   *   auth: {
   *     providers: {
   *       github: defineOAuthProvider({
   *         clientId: process.env.GITHUB_CLIENT_ID!,
   *         clientSecret: process.env.GITHUB_CLIENT_SECRET!,
   *       }),
   *     },
   *   },
   * })
   * ```
   */
  auth?: AuthConfig
}

export function defineConfig(config: CerAppConfig): CerAppConfig {
  return config
}
