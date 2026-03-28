import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Augmented Node.js `IncomingMessage` passed to API route handlers.
 * Route params and query string are pre-parsed; `body` is parsed from JSON automatically.
 */
export interface ApiRequest extends IncomingMessage {
  params: Record<string, string>
  query: Record<string, string>
  body: unknown
}

/**
 * Augmented Node.js `ServerResponse` passed to API route handlers.
 * Adds convenience methods for JSON responses and fluent status setting.
 */
export interface ApiResponse extends ServerResponse {
  json(data: unknown): void
  status(code: number): ApiResponse
}

/**
 * Handler function for a file-based API route (`app/api/**\/*.ts`).
 *
 * @example
 * ```ts
 * // app/api/posts/[id].ts
 * export const GET: ApiHandler = async (req, res) => {
 *   const post = await fetchPost(req.params.id)
 *   res.json(post)
 * }
 * ```
 */
export type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void

/** Combined request/response context passed to API utility functions and composables inside API handlers. */
export interface ApiContext {
  req: ApiRequest
  res: ApiResponse
}
