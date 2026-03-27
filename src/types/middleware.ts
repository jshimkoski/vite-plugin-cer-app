import type { RouteState } from '@jasonshimmy/custom-elements-runtime/router'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Return value from a route middleware function:
 * - `true`   — allow navigation
 * - `false`  — block navigation
 * - `string` — redirect to that path
 */
export type GuardResult = boolean | string | Promise<boolean | string>

/**
 * Route middleware function.
 *
 * Return `true`/`false`/a redirect path to guard navigation, **or** call
 * `next()` to explicitly pass control to the next middleware in the chain
 * (useful for wrapper middleware that needs to run code before AND after
 * downstream middleware completes).
 *
 * @example — guard
 * ```ts
 * export default defineMiddleware((to, from) => {
 *   if (!isLoggedIn()) return '/login'
 *   return true
 * })
 * ```
 *
 * @example — wrapper with next()
 * ```ts
 * export default defineMiddleware(async (to, from, next) => {
 *   console.time('nav')
 *   await next()
 *   console.timeEnd('nav')
 * })
 * ```
 */
export type MiddlewareFn = (
  to: RouteState,
  from: RouteState | null,
  next: () => Promise<void>,
) => GuardResult | void

export type ServerMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void | Promise<void>
