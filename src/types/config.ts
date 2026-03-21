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
}

export function defineConfig(config: CerAppConfig): CerAppConfig {
  return config
}
