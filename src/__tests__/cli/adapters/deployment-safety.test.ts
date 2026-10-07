import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { runNetlifyAdapter } from '../../../cli/adapters/netlify.js'
import { runVercelAdapter } from '../../../cli/adapters/vercel.js'
import { runCloudflareAdapter } from '../../../cli/adapters/cloudflare.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture(manifest: object) {
  const root = mkdtempSync(join(tmpdir(), 'cer-deploy-safety-')); roots.push(root)
  const write = (path: string, value: string) => {
    mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), value)
  }
  write('package.json', '{"type":"module"}')
  write('dist/server/server.js', `export function dispatchRequest(req, res) { res.setHeader('content-type', 'text/html'); res.end('<html>Dynamic ' + req.url + '</html>') }`)
  write('dist/client/index.html', '<html>Shell</html>')
  write('dist/client/assets/main.js', 'public')
  write('dist/client/.vite/manifest.json', '{}')
  write('dist/ssg-manifest.json', JSON.stringify(manifest))
  write('dist/cer-client-manifest.json', '{}')
  write('dist/index.html', '<html>Static</html>')
  write('dist/404.html', '<html>Missing</html>')
  return root
}

for (const [name, adapt, output] of [
  ['netlify', runNetlifyAdapter, 'netlify/functions/ssr.mjs'],
  ['vercel', runVercelAdapter, '.vercel/output/functions/index.func/index.js'],
  ['cloudflare', runCloudflareAdapter, 'dist/_worker.js'],
] as const) {
  for (const manifest of [{ hybrid: true }, { fallback: true }]) {
    it(`${name} retains server dispatch for ${JSON.stringify(manifest)}`, async () => {
      const root = fixture(manifest); await adapt(root)
      expect(existsSync(join(root, output))).toBe(true)
    })
  }
  it(`${name} omits server code and manifests from static publication`, async () => {
    const root = fixture({}); await adapt(root)
    const publicDir = name === 'netlify' ? '.netlify/publish' : name === 'vercel' ? '.vercel/output/static' : 'dist'
    for (const file of ['server/server.js', 'client/index.html', '.vite/manifest.json', 'ssg-manifest.json', 'cer-client-manifest.json']) {
      expect(existsSync(join(root, publicDir, file)), file).toBe(false)
    }
    expect(existsSync(join(root, publicDir, 'assets/main.js'))).toBe(true)
  })
}

it('Cloudflare advanced mode serves assets, keeps HTML dynamic and blocks build-only URLs', async () => {
  const root = fixture({ hybrid: true }); await runCloudflareAdapter(root)
  const worker = (await import(pathToFileURL(join(root, 'dist/_worker.js')).href)).default
  const assets = vi.fn(async (req: Request) => new Response(req.url, { headers: { 'content-type': req.url.endsWith('.js') ? 'text/javascript' : 'text/html' } }))
  const call = (path: string) => worker.fetch(new Request(`https://example.com${path}`), { ASSETS: { fetch: assets } })
  expect((await call('/assets/main.js')).headers.get('content-type')).toBe('text/javascript')
  expect(await (await call('/')).text()).toContain('Dynamic /')
  for (const path of ['/server/server.js', '/%73erver/server.js', '/client/index.html', '/.vite/manifest.json', '/cer-client-manifest.json']) {
    expect((await call(path)).status).toBe(404)
  }
  expect((await call('/%invalid')).status).toBe(400)
  expect(assets).toHaveBeenCalledTimes(2)
  expect(readFileSync(join(root, 'wrangler.toml'), 'utf-8')).toContain('pages_build_output_dir = "dist"')
})

it('Vercel prebuilt output bundles lazy server chunks and external dependencies', async () => {
  const root = fixture({ hybrid: true })
  mkdirSync(join(root, 'node_modules/test-dependency'), { recursive: true })
  writeFileSync(join(root, 'node_modules/test-dependency/package.json'), '{"name":"test-dependency","type":"module","exports":"./index.js"}')
  writeFileSync(join(root, 'node_modules/test-dependency/index.js'), 'export default "Standalone dependency"')
  writeFileSync(join(root, 'dist/server/chunk.js'), 'export const message = "Lazy chunk"')
  writeFileSync(join(root, 'dist/server/server.js'), `import dependency from 'test-dependency'; export async function dispatchRequest(req, res) { const { message } = await import('./chunk.js'); res.end(dependency + ' ' + message) }`)
  await runVercelAdapter(root)
  // Move away from the source node_modules to verify a self-contained function.
  const portable = mkdtempSync(join(tmpdir(), 'cer-portable-function-')); roots.push(portable)
  const { cpSync } = await import('node:fs')
  cpSync(join(root, '.vercel/output/functions/index.func'), portable, { recursive: true })
  const launcher = (await import(pathToFileURL(join(portable, 'index.js')).href)).default
  const server = createServer(launcher)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const { port } = server.address() as import('node:net').AddressInfo
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('Standalone dependency Lazy chunk')
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
})

it('Cloudflare output bundles lazy chunks and dependencies without public server files', async () => {
  const root = fixture({ hybrid: true })
  mkdirSync(join(root, 'node_modules/test-dependency'), { recursive: true })
  writeFileSync(join(root, 'node_modules/test-dependency/package.json'), '{"name":"test-dependency","type":"module","exports":"./index.js"}')
  writeFileSync(join(root, 'node_modules/test-dependency/index.js'), 'export default "Standalone dependency"')
  writeFileSync(join(root, 'dist/server/chunk.js'), 'export const message = "Lazy chunk"')
  writeFileSync(join(root, 'dist/server/server.js'), `import dependency from 'test-dependency'; export async function dispatchRequest(req, res) { const { message } = await import('./chunk.js'); res.end(dependency + ' ' + message) }`)
  await runCloudflareAdapter(root)
  const portable = mkdtempSync(join(tmpdir(), 'cer-portable-worker-')); roots.push(portable)
  writeFileSync(join(portable, 'worker.mjs'), readFileSync(join(root, 'dist/_worker.js')))
  const worker = (await import(pathToFileURL(join(portable, 'worker.mjs')).href)).default
  expect(await (await worker.fetch(new Request('https://example.com/'), {})).text()).toBe('Standalone dependency Lazy chunk')
  for (const name of ['server', 'client', '.vite', 'ssg-manifest.json']) expect(existsSync(join(root, 'dist', name)), name).toBe(false)
})

for (const [name, adapt] of [['netlify', runNetlifyAdapter], ['vercel', runVercelAdapter], ['cloudflare', runCloudflareAdapter]] as const) {
  it(`${name} wires private prerendered documents and preserves generated public metadata`, async () => {
    const root = fixture({ hybrid: true, paths: ['/'], fallback: false })
    writeFileSync(join(root, 'dist/sitemap.xml'), '<urlset/>')
    writeFileSync(join(root, 'dist/robots.txt'), 'User-agent: *')
    writeFileSync(join(root, 'dist/server/server.js'), `export function createDispatchRequest({ prerendered }) {
      return async (req, res) => { res.setHeader('x-middleware', 'active'); res.end(prerendered.paths.includes(req.url) ? await prerendered.read(req.url, req) : 'Runtime ' + req.url) }
    }; export function dispatchRequest(req, res) { res.end('Wrong dispatcher') }`)
    await adapt(root)
    let response: Response
    if (name === 'vercel') {
      const launcher = (await import(pathToFileURL(join(root, '.vercel/output/functions/index.func/index.js')).href)).default
      const server = createServer(launcher)
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      try {
        response = await fetch(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/`)
        expect(await response.text()).toBe('<html>Static</html>')
      } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
    } else if (name === 'netlify') {
      const fn = (await import(pathToFileURL(join(root, 'netlify/functions/ssr.mjs')).href)).default
      response = await fn(new Request('https://example.com/'))
      expect(await response.text()).toBe('<html>Static</html>')
    } else {
      const worker = (await import(pathToFileURL(join(root, 'dist/_worker.js')).href)).default
      const assets = { fetch: async (req: Request) => new Response(readFileSync(join(root, 'dist', new URL(req.url).pathname === '/' ? 'index.html' : new URL(req.url).pathname.slice(1)), 'utf8'), { headers: { 'content-type': 'text/html' } }) }
      response = await worker.fetch(new Request('https://example.com/'), { ASSETS: assets })
      expect(await response.text()).toBe('<html>Static</html>')
    }
    expect(response!.headers.get('x-middleware')).toBe('active')
    const publicDir = name === 'vercel' ? '.vercel/output/static' : name === 'netlify' ? '.netlify/publish' : 'dist'
    expect(readFileSync(join(root, publicDir, 'sitemap.xml'), 'utf8')).toBe('<urlset/>')
    expect(readFileSync(join(root, publicDir, 'robots.txt'), 'utf8')).toBe('User-agent: *')
  })
}
