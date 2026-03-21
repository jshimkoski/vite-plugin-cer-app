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

export interface CerAppConfig {
  mode?: 'spa' | 'ssr' | 'ssg'
  srcDir?: string // defaults to 'app'
  ssg?: SsgConfig
  router?: Pick<RouterConfig, 'base' | 'scrollToFragment'>
  jitCss?: JitCssConfig
  autoImports?: AutoImportsConfig
  port?: number
}

export function defineConfig(config: CerAppConfig): CerAppConfig {
  return config
}
