import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runNetlifyAdapter } from '../../../cli/adapters/netlify.js'
import { runCloudflareAdapter } from '../../../cli/adapters/cloudflare.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

for (const platform of ['netlify', 'cloudflare'] as const) {
  describe(`${platform} generated streaming bridge`, () => {
    async function fixture(source: string) {
      const root = mkdtempSync(join(tmpdir(), 'cer-web-stream-')); roots.push(root)
      mkdirSync(join(root, 'dist/server'), { recursive: true })
      mkdirSync(join(root, 'dist/client'), { recursive: true })
      writeFileSync(join(root, 'package.json'), '{"type":"module"}')
      writeFileSync(join(root, 'dist/server/server.js'), source)
      writeFileSync(join(root, 'dist/client/index.html'), '<html>Shell</html>')
      await (platform === 'netlify' ? runNetlifyAdapter : runCloudflareAdapter)(root)
      const bundle = platform === 'netlify' ? 'netlify/functions/ssr.mjs' : 'dist/_worker.js'
      const app = await import(pathToFileURL(join(root, bundle)).href)
      const call = (path = '/', method = 'GET') => platform === 'netlify'
        ? app.default(new Request('https://example.com' + path, { method }))
        : app.default.fetch(new Request('https://example.com' + path, { method }))
      return { call }
    }

    it('exposes the first chunk while rendering is still waiting for the client', async () => {
      const { call } = await fixture(`
        let release; const waiting = new Promise(resolve => { release = resolve });
        
        export async function dispatchRequest(req, res) {
          if (req.url === '/release') { release(); res.end('released'); return }
          res.setHeader('content-type', 'text/html');
          res.setHeader('set-cookie', ['one=1; Path=/', 'two=2; Path=/']);
          res.write('<html>First');
          await waiting;
          res.end('Last</html>');
        }
      `)
      const response = await call()
      expect(response.headers.getSetCookie()).toHaveLength(2)
      const reader = response.body!.getReader()
      expect(new TextDecoder().decode((await reader.read()).value)).toBe('<html>First')
      await (await call('/release')).text()
      expect(new TextDecoder().decode((await reader.read()).value)).toBe('Last</html>')
      expect((await reader.read()).done).toBe(true)
    })

    it('supports HEAD, 204, 205 and 304 without constructing an illegal body', async () => {
      const { call } = await fixture(`export function dispatchRequest(req, res) {
        res.statusCode = req.url === '/' ? 200 : Number(req.url.slice(1));
        res.setHeader('x-test', 'present'); res.end('ignored');
      }`)
      for (const [path, method, status] of [['/', 'HEAD', 200], ['/204', 'GET', 204], ['/205', 'GET', 205], ['/304', 'GET', 304]] as const) {
        const response = await call(path, method)
        expect(response.status).toBe(status)
        expect(response.headers.get('x-test')).toBe('present')
        expect(response.body).toBeNull()
      }
    })

    it('supports headersSent, writeHead and drain; cancellation closes the producer', async () => {
      const { call } = await fixture(`
        const state = {};
        export async function dispatchRequest(req, res) {
          if (req.url === '/state') { res.end(JSON.stringify(state)); return }
          res.on('close', () => { state.closed = true });
          res.writeHead(201, { 'x-test': 'present' });
          state.sent = res.headersSent;
          const ready = res.write('first');
          if (!ready) await new Promise(resolve => res.once('drain', resolve));
          state.drained = true;
          res.write('second');
        }
      `)
      const response = await call()
      expect(response.status).toBe(201)
      expect((await (await call('/state')).json()).sent).toBe(true)
      const reader = response.body!.getReader()
      await reader.read()
      await reader.read()
      expect((await (await call('/state')).json()).drained).toBe(true)
      await reader.cancel()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect((await (await call('/state')).json()).closed).toBe(true)
    })

    it('returns a controlled 500 when dispatch throws before sending headers', async () => {
      const { call } = await fixture(`export function dispatchRequest() { throw new Error('private details') }`)
      const response = await call()
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Internal Server Error')
    })
  })
}
