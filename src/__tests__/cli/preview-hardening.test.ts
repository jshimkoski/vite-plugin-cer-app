// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startPreview, closePreview } from '../../cli/commands/preview.js'
import type { PreviewServer } from 'vite'

let root: string, server: PreviewServer, base: string
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cer-preview-'))
  await mkdir(join(root, 'dist/guide'), { recursive: true })
  await mkdir(join(root, 'dist/assets'), { recursive: true })
  await mkdir(join(root, 'dist/server'), { recursive: true })
  await writeFile(join(root, 'dist/server/server.js'), 'secret server code')
  await writeFile(join(root, 'dist/ssg-manifest.json'), JSON.stringify({ paths: ['/', '/guide'], errors: [] }))
  await writeFile(join(root, 'dist/index.html'), '<h1>Home</h1>')
  await writeFile(join(root, 'dist/guide/index.html'), '<h1>Guide</h1>')
  await writeFile(join(root, 'dist/404.html'), '<meta name="robots" content="noindex"><h1>Missing</h1>')
  await writeFile(join(root, 'dist/assets/video.mp4'), Buffer.alloc(2048, 1))
  await writeFile(join(root, 'dist/assets/image.avif'), Buffer.alloc(16))
  await writeFile(join(root, 'dist/assets/captions.vtt'), 'WEBVTT')
  server = await startPreview({ root, port: 0, host: '127.0.0.1' })
  const address = server.httpServer.address() as { port: number }
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => { if (server) await closePreview(server); if (root) await rm(root, { recursive: true, force: true }) })
describe('Vite preview CER document routing', () => {
  it('serves known slashless documents and query strings', async () => {
    const response = await fetch(base + '/guide?ref=test')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Guide')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe('no-cache')
  })
  it('serves a dedicated noindex 404 instead of the homepage', async () => {
    const response = await fetch(base + '/absent')
    expect(response.status).toBe(404)
    const html = await response.text()
    expect(html).toContain('noindex')
    expect(html).not.toContain('Home')
  })
  it('retains Vite range support and correct media types', async () => {
    const response = await fetch(base + '/assets/video.mp4', { headers: { Range: 'bytes=0-1023' } })
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 0-1023/2048')
    expect(response.headers.get('content-type')).toContain('video/mp4')
    expect((await response.arrayBuffer()).byteLength).toBe(1024)
    expect((await fetch(base + '/assets/image.avif')).headers.get('content-type')).toContain('image/avif')
    expect((await fetch(base + '/assets/captions.vtt')).headers.get('content-type')).toContain('text/vtt')
  })
  it('does not expose retained server artifacts', async () => {
    const response = await fetch(base + '/server/server.js')
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('secret server code')
  })
  it('keeps hashed assets immutable and supports HEAD', async () => {
    const response = await fetch(base + '/assets/image.avif', { method: 'HEAD' })
    expect(response.headers.get('cache-control')).toContain('immutable')
    expect(await response.text()).toBe('')
  })
})

describe('hybrid preview dispatch', () => {
  let hybridRoot: string, hybrid: PreviewServer, origin: string
  beforeAll(async () => {
    hybridRoot = await mkdtemp(join(tmpdir(), 'cer-preview-hybrid-'))
    await mkdir(join(hybridRoot, 'dist/releases/v1.2'), { recursive: true })
    await mkdir(join(hybridRoot, 'dist/server'), { recursive: true })
    await writeFile(join(hybridRoot, 'package.json'), '{"type":"module"}')
    await writeFile(join(hybridRoot, 'dist/ssg-manifest.json'), JSON.stringify({ paths: ['/releases/v1.2'], hybrid: true, fallback: false }))
    await writeFile(join(hybridRoot, 'dist/releases/v1.2/index.html'), '<h1>Release at build time</h1>')
    await writeFile(join(hybridRoot, 'dist/server/server.js'), `
      export const routes = [{ path: '/isr', meta: { ssg: { revalidate: 60 } } }, { path: '/spa', meta: { render: 'spa' } }];
      export function handler(req, res) { res.end('Fresh ' + req.url) }
      export function spaHandler(req, res) { res.end('Shell') }
      export async function runServerMiddleware(req, res) { res.setHeader('x-middleware', 'active'); return true }
    `)
    hybrid = await startPreview({ root: hybridRoot, port: 0, host: '127.0.0.1' })
    origin = `http://127.0.0.1:${(hybrid.httpServer.address() as { port: number }).port}`
  })
  afterAll(async () => { if (hybrid) await closePreview(hybrid); if (hybridRoot) await rm(hybridRoot, { recursive: true, force: true }) })
  it('runs middleware on dotted prerendered documents and SPA shells', async () => {
    const response = await fetch(origin + '/releases/v1.2')
    expect(await response.text()).toContain('Release at build time')
    expect(response.headers.get('x-middleware')).toBe('active')
    expect(await (await fetch(origin + '/spa')).text()).toBe('Shell')
    expect((await fetch(origin + '/unlisted')).status).toBe(404)
  })
  it('permits anonymous ISR with default transport options, but bypasses cookies and query strings', async () => {
    const response = await fetch(origin + '/isr')
    expect(await response.text()).toBe('Fresh /isr')
    expect(response.headers.get('x-cache')).toBe('HIT')
    for (const [path, init] of [['/isr?q=1', {}], ['/isr', { headers: { Cookie: 'session=private' } }]] as const) {
      const bypass = await fetch(origin + path, init)
      await bypass.text()
      expect(bypass.headers.get('x-cache')).toBeNull()
    }
  })
})
