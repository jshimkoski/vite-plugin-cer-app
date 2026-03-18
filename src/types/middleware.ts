import type { RouteState } from '@jasonshimmy/custom-elements-runtime/router'
import type { IncomingMessage, ServerResponse } from 'node:http'

export type NextFunction = (redirectTo?: string) => void

export type RouteMiddleware = (
  to: RouteState,
  from: RouteState | null,
  next: NextFunction,
) => void | Promise<void>

export type ServerMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void | Promise<void>
