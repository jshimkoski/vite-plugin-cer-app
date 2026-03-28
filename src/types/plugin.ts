import type { Router } from '@jasonshimmy/custom-elements-runtime/router'
import type { CerAppConfig } from './config.js'

/**
 * Application context passed to each plugin's `setup()` function.
 * Use it to provide values to the component tree, access the router,
 * or read the resolved config.
 */
export interface AppContext {
  provide(key: PropertyKey, value: unknown): void
  router: Router
  config: CerAppConfig
}

/**
 * A framework plugin. Plugins run once at app startup (both server and client) before
 * the first route renders. Use them for global setup: registering provide/inject values,
 * subscribing to router events, or initialising third-party libraries.
 *
 * @example
 * ```ts
 * // app/plugins/analytics.ts
 * export default {
 *   name: 'analytics',
 *   async setup({ router }) {
 *     router.subscribe(({ path }) => trackPageView(path))
 *   },
 * } satisfies AppPlugin
 * ```
 */
export interface AppPlugin {
  name: string
  setup(app: AppContext): void | Promise<void>
}
