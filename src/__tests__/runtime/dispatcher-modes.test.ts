import { describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequestDispatcher } from '../../runtime/request-dispatcher.js'

describe('shared document serving contract', () => {
  function fixture(fallback = false) {
    const html = new Map([['/guide', '<h1>Build-time Guide</h1>'], ['/live', 'Stale build'], ['/isr', 'Stale build']])
    const render = vi.fn((req: IncomingMessage, res: ServerResponse) => res.end('Fresh ' + req.url))
    const read = vi.fn((path: string) => html.get(path) ?? null)
    const dispatch = createRequestDispatcher({
      handler: render,
      spaHandler: (_req, res) => res.end('Shell'),
      routes: [
        { path: '/live', meta: { render: 'server' } },
        { path: '/isr', meta: { ssg: { revalidate: 60 } } },
        { path: '/spa', meta: { render: 'spa' } },
        { path: '/guide', meta: { render: 'static' } },
      ],
      runServerMiddleware: async (_req, res) => { res.setHeader('x-middleware', 'active'); return true },
    }, { prerendered: { paths: [...html.keys()], read, fallback } })
    async function request(url: string, method = 'GET') {
      const req = Object.assign(Readable.from([]), { url, method, headers: {} }) as IncomingMessage
      const headers: Record<string, unknown> = {}
      let body = ''
      const res = { statusCode: 200, setHeader: (key: string, value: unknown) => { headers[key.toLowerCase()] = value }, getHeader: (key: string) => headers[key.toLowerCase()], end: (value?: string) => { body = value ?? '' } } as ServerResponse
      await dispatch(req, res)
      return { status: res.statusCode, headers, body }
    }
    return { request, render, read }
  }

  it('runs middleware before serving prerendered HTML and the SPA shell', async () => {
    const { request, render } = fixture()
    const staticPage = await request('/guide/?q=value')
    expect(staticPage.body).toBe('<h1>Build-time Guide</h1>')
    expect(staticPage.headers['x-middleware']).toBe('active')
    const spa = await request('/spa')
    expect(spa.body).toBe('Shell')
    expect(spa.headers['x-middleware']).toBe('active')
    expect(render).not.toHaveBeenCalled()
  })
  it('never serves stale prerenders for server or ISR routes', async () => {
    const { request, read } = fixture()
    expect((await request('/live')).body).toBe('Fresh /live')
    expect((await request('/isr')).body).toBe('Fresh /isr')
    expect((await request('/isr')).headers['x-cache']).toBe('HIT')
    expect(read).not.toHaveBeenCalled()
  })
  it('distinguishes fallback, genuine 404s and HEAD requests', async () => {
    const { request } = fixture()
    const miss = await request('/unlisted')
    expect(miss.status).toBe(404)
    expect(miss.body).toContain('noindex')
    expect((await request('/guide', 'HEAD')).body).toBe('')
    expect((await fixture(true).request('/unlisted')).body).toBe('Fresh /unlisted')
  })
  it('rejects encoded private paths and malformed URLs before middleware', async () => {
    const { request } = fixture()
    expect((await request('/%73erver/server.js')).status).toBe(404)
    expect((await request('/cer-startup-manifest.json')).status).toBe(404)
    expect((await request('/%invalid')).status).toBe(400)
    expect((await request('/a%5Cb')).status).toBe(400)
  })
})
