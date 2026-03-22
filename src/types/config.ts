import type { RouterConfig } from '@jasonshimmy/custom-elements-runtime/router'

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
   * - `'vercel'`     — Vercel Build Output API v3 (`.vercel/output/`)
   * - `'netlify'`    — Netlify Functions v2 + `netlify.toml`
   * - `'cloudflare'` — Cloudflare Pages `_worker.js` + `wrangler.toml`
   *
   * You can also run the adapter independently with `cer-app adapt --platform <name>`.
   */
  adapter?: 'vercel' | 'netlify' | 'cloudflare'
}

export function defineConfig(config: CerAppConfig): CerAppConfig {
  return config
}
