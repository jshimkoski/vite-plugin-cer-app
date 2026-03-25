// Main package entry
export { cerApp } from './plugin/index.js'
export { defineConfig } from './types/config.js'

// Re-export all types
export type { CerAppConfig, SsgConfig, JitCssConfig, AutoImportsConfig, AuthConfig, OAuthProviderConfig, OAuthTokens } from './types/config.js'
export type { HydrateStrategy, SsgPathsContext, PageSsgConfig, PageMeta, PageLoaderContext, PageLoader } from './types/page.js'
export type { ApiRequest, ApiResponse, ApiHandler, ApiContext } from './types/api.js'
export type { AppContext, AppPlugin } from './types/plugin.js'
export type { MiddlewareFn, GuardResult, ServerMiddleware } from './types/middleware.js'
export type { SeoMetaInput } from './runtime/composables/use-seo-meta.js'
export type { CookieOptions, CookieRef } from './runtime/composables/use-cookie.js'
export type { AuthUser, AuthComposable } from './runtime/composables/use-auth.js'
export type { UseFetchOptions, UseFetchReturn, UseFetchResult, UseFetchReactiveReturn } from './runtime/composables/use-fetch.js'

// Re-export resolved config type for use in build scripts
export type { ResolvedCerConfig } from './plugin/dev-server.js'
