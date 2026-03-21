/**
 * Returns the public runtime configuration set in `cer.config.ts` under
 * `runtimeConfig.public`. Available on both server and client.
 *
 * Values are baked in at build time from `virtual:cer-app-config`, so only
 * static/env-var values should be placed here. For truly dynamic config,
 * use a loader or API route.
 *
 * @example
 * // cer.config.ts
 * export default defineConfig({
 *   runtimeConfig: {
 *     public: { apiBase: process.env.VITE_API_BASE ?? '/api' },
 *   },
 * })
 *
 * // app/pages/index.ts
 * const config = useRuntimeConfig()
 * fetch(config.public.apiBase + '/posts')
 */
export function useRuntimeConfig(): { public: Record<string, unknown> } {
  // Dynamic import resolved at runtime — avoids a static circular dependency
  // between the composable and the virtual module.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (globalThis as any).__cerRuntimeConfig
  if (mod) return mod as { public: Record<string, unknown> }

  // Fallback: empty config (e.g. in test environments without the virtual module).
  return { public: {} }
}

/**
 * Called once during app bootstrap to store the resolved runtimeConfig on
 * globalThis so useRuntimeConfig() can access it synchronously in any context
 * (component render, composable, server handler).
 */
export function initRuntimeConfig(config: { public: Record<string, unknown> }): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).__cerRuntimeConfig = config
}
