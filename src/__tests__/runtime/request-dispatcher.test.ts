import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequestDispatcher } from '../../runtime/request-dispatcher.js'

async function request(path: string, method = 'GET', body?: string) {
  const req = Object.assign(Readable.from(body ? [body] : []), { url: path, method, headers: body ? { 'content-type': 'application/json' } : {} }) as IncomingMessage
  let output = '', status = 200
  const headers: Record<string, string> = {}
  const res = { get statusCode() { return status }, set statusCode(value) { status = value }, setHeader(key: string, value: string) { headers[key] = value }, end(value: string) { output = value } } as ServerResponse
  let context = false
  const handler = createRequestDispatcher({
    handler: (_req, response) => response.end('Document'),
    runWithRequestContext: async (_req, _res, fn) => { context = true; try { return await fn() } finally { context = false } },
    apiRoutes: [{ path: '/api/item/:id', handlers: { post: (request: any, response: any) => response.json({ context, params: request.params, query: request.query, body: request.body }) } }],
  })
  await handler(req, res)
  return { output, status, headers }
}
describe('shared request dispatcher', () => {
  it('preserves API context, URLSearchParams decoding and JSON bodies', async () => {
    const result = await request('/api/item/a%20b?q=hello+world', 'POST', '{"value":1}')
    expect(JSON.parse(result.output)).toEqual({ context: true, params: { id: 'a b' }, query: { q: 'hello world' }, body: { value: 1 } })
  })
  it('rejects malformed JSON instead of invoking the handler with empty data', async () => { expect((await request('/api/item/a', 'POST', '{')).status).toBe(400) })
  it('rejects malformed encoded API parameters', async () => { expect((await request('/api/item/%invalid')).status).toBe(400) })
  it('reports allowed methods and missing endpoints', async () => {
    expect((await request('/api/item/a')).status).toBe(405)
    expect((await request('/api/absent')).status).toBe(404)
  })
})

it('rejects oversized streamed API JSON bodies', async () => {
  expect((await request('/api/item/a', 'POST', JSON.stringify({ value: 'x'.repeat(1024 * 1024) }))).status).toBe(413)
})
