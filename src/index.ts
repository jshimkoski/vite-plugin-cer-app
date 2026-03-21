// Main package entry
export { cerApp } from './plugin/index.js'
export { defineConfig } from './types/config.js'

// Re-export all types
export type { CerAppConfig, SsgConfig, JitCssConfig, AutoImportsConfig } from './types/config.js'
export type { HydrateStrategy, SsgPathsContext, PageSsgConfig, PageMeta, PageLoaderContext, PageLoader } from './types/page.js'
export type { ApiRequest, ApiResponse, ApiHandler, ApiContext } from './types/api.js'
export type { AppContext, AppPlugin } from './types/plugin.js'
export type { MiddlewareFn, GuardResult, ServerMiddleware } from './types/middleware.js'

// Re-export resolved config type for use in build scripts
export type { ResolvedCerConfig } from './plugin/dev-server.js'
