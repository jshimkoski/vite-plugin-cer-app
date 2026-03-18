import type { IncomingMessage, ServerResponse } from 'node:http'

export interface ApiRequest extends IncomingMessage {
  params: Record<string, string>
  query: Record<string, string>
  body: unknown
}

export interface ApiResponse extends ServerResponse {
  json(data: unknown): void
  status(code: number): ApiResponse
}

export type ApiHandler = (req: ApiRequest, res: ApiResponse) => Promise<void> | void

export interface ApiContext {
  req: ApiRequest
  res: ApiResponse
}
