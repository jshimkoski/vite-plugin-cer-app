import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'pathe'

// Read the preview command source to verify hardening requirements are present.
const src = readFileSync(
  resolve(import.meta.dirname, '../../cli/commands/preview.ts'),
  'utf-8',
)

// ─── Security headers ─────────────────────────────────────────────────────────

describe('preview server — security headers', () => {
  it('defines setSecurityHeaders helper', () => {
    expect(src).toContain('function setSecurityHeaders(')
  })

  it('sets X-Content-Type-Options: nosniff', () => {
    expect(src).toContain("'X-Content-Type-Options'")
    expect(src).toContain('nosniff')
  })

  it('sets X-Frame-Options: DENY', () => {
    expect(src).toContain("'X-Frame-Options'")
    expect(src).toContain('DENY')
  })

  it('sets Referrer-Policy: strict-origin-when-cross-origin', () => {
    expect(src).toContain("'Referrer-Policy'")
    expect(src).toContain('strict-origin-when-cross-origin')
  })

  it('calls setSecurityHeaders in serveStaticFile', () => {
    const fnStart = src.indexOf('function serveStaticFile(')
    const nextFn = src.indexOf('\nfunction ', fnStart + 1)
    const body = src.slice(fnStart, nextFn > -1 ? nextFn : undefined)
    expect(body).toContain('setSecurityHeaders(res)')
  })

  it('calls setSecurityHeaders at the top of the SSR request handler', () => {
    const handlerStart = src.indexOf('createHttpServer(async (req: IncomingMessage, res: ServerResponse)')
    const handlerEnd = src.indexOf('server.listen(port', handlerStart)
    const handler = src.slice(handlerStart, handlerEnd)
    expect(handler).toContain('setSecurityHeaders(res)')
    // It should be the first thing done before any routing logic
    const secHeadersIdx = handler.indexOf('setSecurityHeaders(res)')
    const urlParseIdx = handler.indexOf('req.url ?? ')
    expect(secHeadersIdx).toBeLessThan(urlParseIdx)
  })

  it('calls setSecurityHeaders at the top of the static request handler', () => {
    const handlerStart = src.indexOf('createHttpServer((req: IncomingMessage, res: ServerResponse)')
    const handlerEnd = src.indexOf('server.listen(port', handlerStart)
    const handler = src.slice(handlerStart, handlerEnd)
    expect(handler).toContain('setSecurityHeaders(res)')
  })
})

// ─── Cache-Control ────────────────────────────────────────────────────────────

describe('preview server — Cache-Control', () => {
  it('defines getCacheControl helper', () => {
    expect(src).toContain('function getCacheControl(')
  })

  it('returns immutable cache for /assets/ paths', () => {
    expect(src).toContain("'/assets/'")
    expect(src).toContain('public, max-age=31536000, immutable')
  })

  it('returns no-cache for non-asset paths', () => {
    // The getCacheControl function must return 'no-cache' as fallback
    const fnStart = src.indexOf('function getCacheControl(')
    const fnEnd = src.indexOf('\nfunction ', fnStart + 1)
    const body = src.slice(fnStart, fnEnd > -1 ? fnEnd : undefined)
    expect(body).toContain("'no-cache'")
  })

  it('uses getCacheControl in serveStaticFile instead of hardcoded no-cache', () => {
    const fnStart = src.indexOf('function serveStaticFile(')
    const nextFn = src.indexOf('\nfunction ', fnStart + 1)
    const body = src.slice(fnStart, nextFn > -1 ? nextFn : undefined)
    expect(body).toContain('getCacheControl(filePath)')
    // Must NOT have a hardcoded no-cache
    expect(body).not.toContain("'no-cache'")
  })

  it('uses getCacheControl for client assets in the static server', () => {
    // The static server also serves assets from dist/client — it should use getCacheControl
    const staticHandlerStart = src.indexOf('createHttpServer((req: IncomingMessage, res: ServerResponse)')
    expect(src.slice(staticHandlerStart)).toContain('getCacheControl(')
  })
})

// ─── Graceful shutdown ────────────────────────────────────────────────────────

describe('preview server — graceful shutdown', () => {
  it('defines registerGracefulShutdown helper', () => {
    expect(src).toContain('function registerGracefulShutdown(')
  })

  it('calls server.close() for graceful drain', () => {
    const fnStart = src.indexOf('function registerGracefulShutdown(')
    const fnEnd = src.indexOf('\nexport ', fnStart)
    const body = src.slice(fnStart, fnEnd > -1 ? fnEnd : undefined)
    expect(body).toContain('server.close(')
  })

  it('sets a 10-second force-exit timeout', () => {
    const fnStart = src.indexOf('function registerGracefulShutdown(')
    const fnEnd = src.indexOf('\nexport ', fnStart)
    const body = src.slice(fnStart, fnEnd > -1 ? fnEnd : undefined)
    expect(body).toContain('10_000')
    expect(body).toContain('process.exit(1)')
  })

  it('calls t.unref() so the timeout does not keep the event loop alive', () => {
    const fnStart = src.indexOf('function registerGracefulShutdown(')
    const fnEnd = src.indexOf('\nexport ', fnStart)
    const body = src.slice(fnStart, fnEnd > -1 ? fnEnd : undefined)
    expect(body).toContain('.unref()')
  })

  it('listens for both SIGTERM and SIGINT', () => {
    expect(src).toContain("'SIGTERM'")
    expect(src).toContain("'SIGINT'")
  })

  it('logs the signal name on shutdown', () => {
    const fnStart = src.indexOf('function registerGracefulShutdown(')
    const fnEnd = src.indexOf('\nexport ', fnStart)
    const body = src.slice(fnStart, fnEnd > -1 ? fnEnd : undefined)
    expect(body).toContain('signal')
    expect(body).toContain('console.log(')
  })

  it('calls registerGracefulShutdown for the SSR server', () => {
    // registerGracefulShutdown must be called after each server's listen()
    const firstListen = src.indexOf('server.listen(port')
    const firstShutdown = src.indexOf('registerGracefulShutdown(server)')
    expect(firstShutdown).toBeGreaterThan(firstListen)
  })

  it('calls registerGracefulShutdown for the static server', () => {
    // Both SSR and static server paths should register graceful shutdown
    const allShutdowns = src.split('registerGracefulShutdown(server)').length - 1
    expect(allShutdowns).toBeGreaterThanOrEqual(2)
  })
})

// ─── Request timeouts ─────────────────────────────────────────────────────────

describe('preview server — request timeouts', () => {
  it('sets server.headersTimeout to protect against slow-send attacks', () => {
    expect(src).toContain('server.headersTimeout')
    expect(src).toContain('10_000')
  })

  it('sets server.requestTimeout to limit total request duration', () => {
    expect(src).toContain('server.requestTimeout')
    expect(src).toContain('30_000')
  })

  it('applies timeouts to the SSR server', () => {
    const ssrListenIdx = src.indexOf("console.log(`[cer-app] SSR preview running at")
    const ssrTimeoutIdx = src.lastIndexOf('server.requestTimeout', ssrListenIdx)
    expect(ssrTimeoutIdx).toBeGreaterThan(-1)
  })

  it('applies timeouts to the static server', () => {
    const staticListenIdx = src.indexOf("console.log(`[cer-app] Static preview running at")
    const staticTimeoutIdx = src.lastIndexOf('server.requestTimeout', staticListenIdx)
    expect(staticTimeoutIdx).toBeGreaterThan(-1)
  })
})
