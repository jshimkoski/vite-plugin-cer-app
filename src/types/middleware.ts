import type { RouteState } from '@jasonshimmy/custom-elements-runtime/router'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Return value from a route middleware function:
 * - `true`   — allow navigation
 * - `false`  — block navigation
 * - `string` — redirect to that path
 */
export type GuardResult = boolean | string | Promise<boolean | string>

export type MiddlewareFn = (to: RouteState, from: RouteState | null) => GuardResult

export type ServerMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void | Promise<void>
