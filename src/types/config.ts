import type { RouterConfig } from '@jasonshimmy/custom-elements-runtime/router'
import type { IncomingMessage } from 'node:http'

// ─── Observability hook context types ─────────────────────────────────────────

/**
 * Context passed to the `onError` hook.
 * `type` indicates which layer the error originated from so reporters can
 * tag or route errors appropriately.
 */
export interface ErrorHookContext {
  /** The layer that threw the error. */
  type: 'loader' | 'render' | 'middleware'
  /** The request URL pathname (e.g. `/about`). */
  path: string
  /** The raw Node.js incoming request. */
  req: IncomingMessage
}

/**
 * Context passed to the `onRequest` hook.
 * Fires at the start of every SSR request, before the route is matched
 * or the loader runs.
 */
export interface RequestHookContext {
  /** The request URL pathname (e.g. `/about`). */
  path: string
  /** HTTP method in upper-case (e.g. `'GET'`). */
  method: string
  /** The raw Node.js incoming request. */
  req: IncomingMessage
}

/**
 * Context passed to the `onResponse` hook.
 * Fires after the response has been sent (both success and error paths).
 * Use this for latency tracking and request logging.
 */
export interface ResponseHookContext {
  /** The request URL pathname (e.g. `/about`). */
  path: string
  /** HTTP method in upper-case (e.g. `'GET'`). */
  method: string
  /** Final HTTP status code written to the response. */
  statusCode: number
  /** Request duration in milliseconds from the first byte received to `res.end()`. */
  duration: number
  /** The raw Node.js incoming request. */
  req: IncomingMessage
}

// ─── OAuth / Auth types ───────────────────────────────────────────────────────

/** Token payload returned by an OAuth provider after a successful authorization code exchange. */
export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  tokenType: string
}

/** Configuration for a single OAuth 2.0 provider (Google, GitHub, Discord, or a custom provider). */
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

/** Authentication configuration. Enables OAuth login flows and auto-generates `/api/auth/*` routes. */
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

/** Internationalisation routing configuration. When set, locale-aware URL routes are generated and `useLocale()` is enabled. */
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

/** Global Static Site Generation (SSG) configuration. Controls which routes are pre-rendered and at what concurrency. */
export interface SsgConfig {
  /**
   * Routes to pre-render.
   * - `'auto'` (default) — pre-render every static route discovered in `app/pages/`.
   * - `string[]` — explicit list of paths (e.g. `['/about', '/contact']`).
   */
  routes?: 'auto' | string[]
  /** Maximum number of pages rendered in parallel. Defaults to `1`. Increase for faster SSG builds at the cost of higher memory usage. */
  concurrency?: number
  /** When `true`, unenumerated routes fall back to SSR at runtime instead of returning 404. */
  fallback?: boolean
}

/** JIT (Just-In-Time) CSS configuration for shadow-DOM style injection. */
export interface JitCssConfig {
  /** Additional glob patterns for content files scanned by the JIT CSS engine. */
  content?: string[]
  /** Enable the extended color palette. Defaults to `false`. */
  extendedColors?: boolean
  /**
   * Project-specific color families registered in the JIT CSS engine at both
   * build time and runtime. Each key is a color family name (e.g. `brand`);
   * its value is a map of scale steps to CSS color values.
   *
   * Color family names must be a single lowercase word (no hyphens). Shades
   * can be any string key — numeric steps (`'500'`) or semantic names
   * (`'DEFAULT'`, `'on'`, `'container'`). When no shade is specified in a
   * utility class (e.g. `bg-brand`), the `DEFAULT` shade is used.
   *
   * @example
   * ```ts
   * customColors: {
   *   brand: { '100': '#ede9fe', '500': '#7c3aed', '900': '#4c1d95' },
   *   surface: { DEFAULT: 'var(--md-sys-color-surface)' },
   * }
   * ```
   */
  customColors?: Record<string, Record<string, string>>
}

/** Fine-grained control over which auto-import categories are injected into page/layout/component files. All categories are enabled by default. */
export interface AutoImportsConfig {
  /** Auto-import components defined in `app/components/`. Defaults to `true`. */
  components?: boolean
  /** Auto-import framework composables (`useHead`, `useState`, etc.). Defaults to `true`. */
  composables?: boolean
  /** Auto-import template directives (`when`, `each`, `bind`). Defaults to `true`. */
  directives?: boolean
  /** Auto-import runtime primitives (`component`, `html`, `ref`, etc.). Defaults to `true`. */
  runtime?: boolean
}

/** Arbitrary public runtime values serialized into the virtual module at build time. Available on both server and client via `useRuntimeConfig().public`. */
export interface RuntimePublicConfig {
  [key: string]: unknown
}

/** Server-only secrets resolved from `process.env` at startup. Never serialized into the client bundle. Available via `useRuntimeConfig().private` in loaders and server middleware only. */
export interface RuntimePrivateConfig {
  /**
   * HMAC-SHA-256 signing secret(s) for `useSession()`.
   *
   * Pass a single string for simple usage, or an **array** to support secret
   * rotation without logging everyone out:
   * - The **first** element is the active key — new sessions are signed with it.
   * - Subsequent elements are accepted for **verification only** — old sessions
   *   signed with them continue to work until they expire.
   *
   * ```ts
   * // cer.config.ts
   * runtimeConfig: {
   *   private: {
   *     sessionSecret: [
   *       process.env.SESSION_SECRET_NEW!,  // signs new sessions
   *       process.env.SESSION_SECRET_OLD!,  // still accepted during rotation
   *     ],
   *   },
   * }
   * ```
   */
  sessionSecret?: string | string[]
  [key: string]: string | string[] | undefined
}

/** Runtime configuration split into `public` (client + server) and `private` (server-only) sections. */
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

/** Root configuration object for `cer.config.ts`. Pass to `defineConfig()` for type-safe configuration. */
export interface CerAppConfig {
  mode?: 'spa' | 'ssr' | 'ssg'
  srcDir?: string // defaults to 'app'
  /** File-based content layer configuration. Reads from `content/` at the project root by default. */
  content?: import('./content.js').CerContentConfig
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
  /**
   * Called when an error is caught by the framework's SSR error boundaries
   * (loader throws, render crash, or server middleware throws). Use this to
   * forward errors to Sentry, Datadog, or any other error-reporting service.
   *
   * Errors in this hook are silently swallowed so they cannot crash the request handler.
   *
   * @example
   * ```ts
   * import * as Sentry from '@sentry/node'
   * export default defineConfig({
   *   onError(err, ctx) {
   *     Sentry.captureException(err, { tags: { type: ctx.type, path: ctx.path } })
   *   },
   * })
   * ```
   */
  onError?: (err: unknown, ctx: ErrorHookContext) => void | Promise<void>
  /**
   * Called at the start of every SSR request, before route matching and the loader.
   * Use this for request logging or to initialise per-request APM transactions.
   *
   * Errors in this hook are silently swallowed.
   */
  onRequest?: (ctx: RequestHookContext) => void | Promise<void>
  /**
   * Called after every SSR response is sent (both success and error paths).
   * `ctx.duration` contains the elapsed milliseconds from first byte to `res.end()`.
   * Use this for latency tracking and access logging.
   *
   * Errors in this hook are silently swallowed.
   */
  onResponse?: (ctx: ResponseHookContext) => void | Promise<void>
}

/**
 * Define the framework configuration with full TypeScript intellisense.
 * This is a pass-through helper — it returns `config` unchanged and exists
 * solely to provide type checking and IDE autocompletion in `cer.config.ts`.
 *
 * @example
 * ```ts
 * // cer.config.ts
 * import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'
 *
 * export default defineConfig({
 *   mode: 'ssr',
 *   runtimeConfig: {
 *     public: { apiBase: 'https://api.example.com' },
 *     private: { dbUrl: '' },
 *   },
 * })
 * ```
 */
export function defineConfig(config: CerAppConfig): CerAppConfig {
  return config
}
