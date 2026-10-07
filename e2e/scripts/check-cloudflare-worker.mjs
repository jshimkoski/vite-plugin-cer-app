import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../kitchen-sink', import.meta.url))
const state = await mkdtemp(join(tmpdir(), 'cer-workerd-'))
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
  'exec', '--yes', '--package', 'wrangler@4.148.0', '--', 'wrangler',
  'pages', 'dev', 'dist', '--port', String(port), '--persist-to', state,
], {
  cwd: root, detached: process.platform !== 'win32',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = '', launchError
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })
child.on('error', error => { launchError = error })
const exited = new Promise(resolve => child.once('close', resolve))
const origin = `http://127.0.0.1:${port}`
const check = (condition, message) => { if (!condition) throw new Error(message) }
try {
  const deadline = Date.now() + 120_000
  while (true) {
    if (launchError || child.exitCode !== null) throw launchError ?? new Error('Wrangler exited before startup')
    try {
      const response = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(1000) })
      await response.arrayBuffer()
      break
    } catch (error) { if (Date.now() >= deadline) throw error }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  const request = async (path, init) => {
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(10_000), ...init })
    return { response, body: await response.text() }
  }
  for (const path of ['/', '/about', '/content-doc', '/render-server-test', '/render-spa-test']) {
    const { response, body } = await request(path)
    check(response.status === 200 && response.headers.get('x-cer-middleware') === 'active', `${path}: status/middleware`)
    if (path === '/content-doc') check(body.includes('data-cy="content-doc-title"'), 'Embedded content is missing')
    if (path === '/render-spa-test') check(!body.includes('render-spa-heading'), 'SPA route was rendered on the server')
  }
  const health = await request('/api/health')
  check(health.response.status === 200 && JSON.parse(health.body).status === 'ok', 'API dispatch failed')
  const routeBodies = await Promise.all(['alpha', 'beta'].map(token => request('/route-info?token=' + token)))
  for (const [index, token] of ['alpha', 'beta'].entries()) {
    check(routeBodies[index].body.includes('<code>' + token + ':/route-info</code>'), 'Concurrent loader route state leaked')
    check(routeBodies[index].body.includes('<code>Route Info Page</code>'), 'Render route state is missing')
  }
  const cached = await request('/blog/first-post')
  check(cached.response.status === 200 && cached.response.headers.get('x-cache') === 'HIT', 'ISR cold capture failed')
  const second = await request('/blog/first-post')
  check(second.response.headers.get('x-cache') === 'HIT', 'ISR cache hit failed')
  const bypass = await request('/blog/first-post?preview=1')
  check(!bypass.response.headers.has('x-cache'), 'Query did not bypass ISR')
  for (const path of ['/server/server.js', '/%73erver/server.js', '/client/index.html', '/cer-client-manifest.json']) {
    check((await request(path)).response.status === 404, 'Private build URL exposed: ' + path)
  }
  const html = (await request('/')).body
  const asset = html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1]
  check(asset, 'No client asset in SSR shell')
  const servedAsset = await request(asset)
  check(servedAsset.response.status === 200 && servedAsset.response.headers.get('content-type')?.includes('javascript'), 'ASSETS forwarding failed')
  console.log('Cloudflare workerd checks passed: SSR, SPA, content, API, middleware, concurrent contexts, ISR and private/public assets.')
} catch (error) {
  console.error(output)
  throw error
} finally {
  if (child.exitCode === null) {
    try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM') } catch { /* already exited */ }
    const closed = await Promise.race([exited.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 5000))])
    if (!closed) { try { process.platform === 'win32' ? child.kill('SIGKILL') : process.kill(-child.pid, 'SIGKILL') } catch { /* already exited */ } }
  }
  await rm(state, { recursive: true, force: true })
}
