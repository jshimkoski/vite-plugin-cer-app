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

/**
 * Server middleware function. Receives the raw Node.js `req`/`res` pair and a `next`
 * callback. Call `next()` to pass control to the next middleware in the chain,
 * or call `next(err)` to signal an error (sets the response status from `err.status`,
 * defaulting to 500).
 *
 * Defined with `defineServerMiddleware()` and placed in `app/middleware/`.
 *
 * @example
 * ```ts
 * export default defineServerMiddleware((req, res, next) => {
 *   res.setHeader('X-Request-Id', crypto.randomUUID())
 *   next()
 * })
 * ```
 */
export type ServerMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void | Promise<void>
