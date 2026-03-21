import type { MiddlewareFn } from '../../types/middleware.js'

/**
 * Identity helper that gives TypeScript the correct `MiddlewareFn` type
 * without any runtime cost.
 *
 * @example
 * // app/middleware/auth.ts
 * export default defineMiddleware(async (to, from) => {
 *   const isLoggedIn = checkSession()
 *   if (!isLoggedIn) return '/login'   // redirect
 *   return true                         // allow
 * })
 */
export function defineMiddleware(fn: MiddlewareFn): MiddlewareFn {
  return fn
}
