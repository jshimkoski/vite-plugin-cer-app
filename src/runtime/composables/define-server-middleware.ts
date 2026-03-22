import type { ServerMiddleware } from '../../types/middleware.js'

/**
 * Identity helper that gives `ServerMiddleware` functions full TypeScript
 * types without any runtime cost. Usage:
 *
 * ```ts
 * // server/middleware/auth.ts
 * export default defineServerMiddleware(async (req, res, next) => {
 *   const session = await useSession().get()
 *   if (!session) { res.statusCode = 401; res.end('Unauthorized'); return }
 *   next()
 * })
 * ```
 */
export function defineServerMiddleware(fn: ServerMiddleware): ServerMiddleware {
  return fn
}
