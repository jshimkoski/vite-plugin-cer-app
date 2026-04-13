import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'pathe'

const src = readFileSync(
  resolve(import.meta.dirname, '../../runtime/entry-server-template.ts'),
  'utf-8',
)

describe('entry-server-template (ENTRY_SERVER_TEMPLATE content)', () => {
  it('does not import virtual:cer-components (components injected per-file by cerComponentImports)', () => {
    expect(src).not.toContain('virtual:cer-components')
  })

  it('imports virtual:cer-routes', () => {
    expect(src).toContain('virtual:cer-routes')
  })

  it('imports virtual:cer-layouts', () => {
    expect(src).toContain('virtual:cer-layouts')
  })

  it('imports virtual:cer-plugins', () => {
    expect(src).toContain('virtual:cer-plugins')
  })

  it('imports virtual:cer-server-api', () => {
    expect(src).toContain('virtual:cer-server-api')
  })

  it('imports registerBuiltinComponents from custom-elements-runtime', () => {
    expect(src).toContain('registerBuiltinComponents')
    expect(src).toContain('setDevMode')
    expect(src).toContain('@jasonshimmy/custom-elements-runtime')
  })

  it('enables runtime dev logging from the downstream server env', () => {
    expect(src).toContain('const _cerRuntimeDev')
    expect(src).toContain('import.meta.env?.DEV')
    expect(src).toContain('_cerProcess?.env')
    expect(src).toContain('(globalThis).__CE_RUNTIME_DEV__ = _cerRuntimeDev')
    expect(src).toContain('setDevMode(_cerRuntimeDev)')
  })

  it('imports renderToStreamWithJITCSSDSD and DSD_POLYFILL_SCRIPT from ssr subpath', () => {
    expect(src).toContain('renderToStreamWithJITCSSDSD')
    expect(src).toContain('DSD_POLYFILL_SCRIPT')
    expect(src).toContain('custom-elements-runtime/ssr')
  })

  it('imports initRouter from router subpath', () => {
    expect(src).toContain('initRouter')
    expect(src).toContain('custom-elements-runtime/router')
  })

  it('imports beginHeadCollection, endHeadCollection, serializeHeadTags from composables', () => {
    expect(src).toContain('beginHeadCollection')
    expect(src).toContain('endHeadCollection')
    expect(src).toContain('serializeHeadTags')
    expect(src).toContain('vite-plugin-cer-app/composables')
  })

  it('uses AsyncLocalStorage for request-scoped data isolation', () => {
    expect(src).toContain('AsyncLocalStorage')
    expect(src).toContain('node:async_hooks')
    expect(src).toContain('_cerDataStore')
    expect(src).toContain('__CER_DATA_STORE__')
  })

  it('scopes each request in _cerDataStore.run()', () => {
    expect(src).toContain('_cerDataStore.run(')
  })

  it('scopes loader data in _cerDataStore.run(loaderData) for rendering', () => {
    // enterWith() does not propagate across await boundaries to a parent
    // async continuation; run() is used instead so usePageData() in
    // renderToStreamWithJITCSSDSD sees the correct store value.
    expect(src).toContain('_cerDataStore.run(loaderData')
    expect(src).toContain('loaderData = data')
    expect(src).not.toContain('_cerDataStore.enterWith(data)')
  })

  it('initializes plugins and sets globalThis.__cerPluginProvides', () => {
    expect(src).toContain('__cerPluginProvides')
    expect(src).toContain('_pluginProvides')
    expect(src).toContain('_pluginsReady')
  })

  it('awaits _pluginsReady before handling each request', () => {
    expect(src).toContain('await _pluginsReady')
  })

  it('calls registerEntityMap with entities.json', () => {
    expect(src).toContain('registerEntityMap(entitiesJson)')
    expect(src).toContain('entities.json')
  })

  it('loads client index.html for merging', () => {
    expect(src).toContain('_clientTemplate')
    expect(src).toContain('../client/index.html')
  })

  it('defines _mergeWithClientTemplate helper', () => {
    expect(src).toContain('_mergeWithClientTemplate')
  })

  it('defines _prepareRequest async function', () => {
    expect(src).toContain('_prepareRequest')
  })

  it('calls endHeadCollection() synchronously before any await to avoid race conditions', () => {
    expect(src).toContain('beginHeadCollection()')
    expect(src).toContain('endHeadCollection()')
    // endHeadCollection must come before reader.read() so concurrent requests
    // (SSG concurrency > 1) cannot reset the shared globalThis collector between
    // beginHeadCollection and endHeadCollection.
    const endIdx = src.indexOf('endHeadCollection()')
    const readIdx = src.indexOf('reader.read()')
    expect(endIdx).toBeGreaterThan(-1)
    expect(readIdx).toBeGreaterThan(-1)
    expect(endIdx).toBeLessThan(readIdx)
  })

  it('passes dsdPolyfill: false to suppress inline polyfill', () => {
    expect(src).toContain('dsdPolyfill: false')
  })

  it('injects DSD_POLYFILL_SCRIPT before </body>', () => {
    expect(src).toContain("lastIndexOf('</body>')")
    expect(src).toContain('DSD_POLYFILL_SCRIPT + fromBodyClose')
  })

  it('merges SSR html with client template when available', () => {
    // Dev mode: per-request global takes precedence over module-level _clientTemplate
    expect(src).toContain('_resolvedClientTemplate')
    expect(src).toContain('(globalThis).__CER_CLIENT_TEMPLATE__ ?? _clientTemplate')
    expect(src).toContain('_mergeWithClientTemplate(ssrHtml, _resolvedClientTemplate)')
  })

  it('exports handler as both named and default export', () => {
    expect(src).toContain('export const handler')
    expect(src).toContain('export default handler')
  })

  it('exports apiRoutes, plugins, layouts, and routes', () => {
    expect(src).toContain('export { apiRoutes, plugins, layouts, routes, serverMiddleware }')
  })

  it('exports runServerMiddleware for adapter use', () => {
    expect(src).toContain('export async function runServerMiddleware(req, res)')
  })

  it('exports runWithRequestContext for wrapping API handlers in request context', () => {
    expect(src).toContain('export function runWithRequestContext(req, res, fn)')
    expect(src).toContain('_cerReqStore.run({ req, res }, fn)')
  })

  it('sets Content-Type header on response', () => {
    expect(src).toContain('text/html; charset=utf-8')
  })

  it('sets Transfer-Encoding: chunked header for streaming', () => {
    expect(src).toContain('Transfer-Encoding')
    expect(src).toContain('chunked')
  })

  it('reads the stream using a reader loop', () => {
    expect(src).toContain('stream.getReader()')
    expect(src).toContain('reader.read()')
  })

  // ─── Error boundary ──────────────────────────────────────────────────────────

  it('imports errorTag from virtual:cer-error', () => {
    expect(src).toContain('errorTag')
    expect(src).toContain('virtual:cer-error')
  })

  it('catches loader errors in _prepareRequest', () => {
    expect(src).toContain('catch (err)')
    // The catch block must exist inside _prepareRequest (after the function definition)
    const prepareIdx = src.indexOf('const _prepareRequest')
    const catchIdx = src.indexOf('catch (err)', prepareIdx)
    expect(prepareIdx).toBeGreaterThan(-1)
    expect(catchIdx).toBeGreaterThan(prepareIdx)
  })

  it('extracts .status from the thrown error for HTTP status code', () => {
    expect(src).toContain("'status' in err")
    expect(src).toContain('err.status')
  })

  it('guards err.status with typeof === "number" so Response-like thrown values work', () => {
    // `new Response("...", { status: 404 })` has a numeric `.status` property.
    // The typeof guard ensures that non-numeric status values (e.g. a string "404")
    // do not pass through — only genuine numbers are accepted.
    expect(src).toContain("typeof err.status === 'number'")
  })

  it('defaults to status 500 when thrown error has no .status', () => {
    expect(src).toContain(': 500')
  })

  it('renders error component when loader throws and an error tag is available', () => {
    // P2-2: effectiveErrorTag (route-level or global) is used as the tag
    expect(src).toContain('tag: effectiveErrorTag')
  })

  it('logs to console.error when loader throws and no error tag is defined', () => {
    expect(src).toContain('console.error')
    expect(src).toContain('!effectiveErrorTag')
  })

  it('propagates status to res.statusCode', () => {
    expect(src).toContain('res.statusCode = status')
  })

  it('returns status: null on the happy path when the route is not marked as not-found', () => {
    expect(src).toContain('isNotFoundRoute ? 404 : null')
  })

  it('sets status 404 only when the matched route is marked as framework not-found', () => {
    expect(src).toContain('route?.meta?._cerNotFound === true')
  })

  // ─── Render error handling (P0-1) ────────────────────────────────────────────
  // Note: the custom-elements runtime catches *component-level* render errors
  // internally (see ssr-context.ts runComponentSSRRender). The try/catch here
  // guards against *infrastructure-level* failures that escape the runtime.

  it('wraps the render + stream loop in a try/catch block', () => {
    expect(src).toContain('} catch (_renderErr) {')
  })

  it('calls endHeadCollection() in the catch block to prevent collector leaks', () => {
    const catchIdx = src.indexOf('} catch (_renderErr) {')
    const endCollectorInCatch = src.indexOf('endHeadCollection()', catchIdx)
    expect(catchIdx).toBeGreaterThan(-1)
    expect(endCollectorInCatch).toBeGreaterThan(catchIdx)
  })

  it('sends a 500 response when an infrastructure error occurs before headers are sent', () => {
    expect(src).toContain('res.headersSent')
    expect(src).toContain('res.statusCode = 500')
  })

  it('closes the connection with res.end() when headers were already sent during streaming', () => {
    const catchIdx = src.indexOf('} catch (_renderErr) {')
    const elseEndIdx = src.indexOf('res.end()', catchIdx)
    expect(elseEndIdx).toBeGreaterThan(catchIdx)
  })

  it('includes an HTML error page body in the 500 infrastructure-error response', () => {
    expect(src).toContain('500 Internal Server Error')
  })

  // ─── ISR production export ───────────────────────────────────────────────────

  it('imports createIsrHandler from the isr subpath', () => {
    expect(src).toContain('createIsrHandler')
    expect(src).toContain('vite-plugin-cer-app/isr')
  })

  it('exports isrHandler wrapping handler with ISR caching', () => {
    expect(src).toContain('export const isrHandler')
    expect(src).toContain('createIsrHandler(routes, handler)')
  })

  // ─── useCookie req/res store ──────────────────────────────────────────────────

  it('creates _cerReqStore AsyncLocalStorage for request-scoped cookie access', () => {
    expect(src).toContain('_cerReqStore')
    expect(src).toContain('__CER_REQ_STORE__')
  })

  it('exposes _cerReqStore on globalThis as __CER_REQ_STORE__', () => {
    expect(src).toContain('__CER_REQ_STORE__ = _cerReqStore')
  })

  it('wraps handler body in _cerReqStore.run({ req, res }, ...) so useCookie can access req/res', () => {
    expect(src).toContain('_cerReqStore.run({ req, res }')
    // req/res store wraps the data store — it must appear before _cerDataStore.run
    const reqStoreIdx = src.indexOf('_cerReqStore.run(')
    const dataStoreIdx = src.indexOf('_cerDataStore.run(')
    expect(reqStoreIdx).toBeGreaterThan(-1)
    expect(dataStoreIdx).toBeGreaterThan(-1)
    expect(reqStoreIdx).toBeLessThan(dataStoreIdx)
  })

  // ─── P1-1: Synthetic 404 from null pageTag ───────────────────────────────────

  it('handles null pageTag from the synthetic catch-all route (returns 404 status)', () => {
    // The synthetic catch-all resolves to { default: null }; _prepareRequest must
    // check for this and return 404 rather than crashing.
    expect(src).toContain('!pageTag')
    // Should return status: 404 for null pageTag
    expect(src).toContain('status: 404')
  })

  it('uses the per-route errorTag for 404 display when available', () => {
    // If the synthetic 404 route has an errorTag, it should be used as the 404 vnode tag
    expect(src).toContain('routeErrorTag')
    // Falls back to global errorTag when no per-route error component exists
    const routeErrIdx = src.indexOf('routeErrorTag')
    const globalErrIdx = src.indexOf('errorTag')
    expect(routeErrIdx).toBeGreaterThan(-1)
    expect(globalErrIdx).toBeGreaterThan(-1)
  })

  // ─── P1-2: runServerMiddleware status code extraction ──────────────────────

  it('runServerMiddleware reads err.status to pick the response status code', () => {
    // The catch block should extract err.status before defaulting to 500
    expect(src).toContain('err.status')
    // isNaN guard ensures non-numeric status values default to 500
    expect(src).toContain('isNaN')
  })

  it('runServerMiddleware defaults to 500 when err has no .status property', () => {
    expect(src).toContain(': 500')
  })

  // ─── P2-2: Per-route error component ────────────────────────────────────────

  it('uses route.meta.errorTag over the global errorTag when available', () => {
    // The error catch inside _prepareRequest should prefer the per-route error tag
    expect(src).toContain('route?.meta?.errorTag')
    // Fallback to global errorTag
    expect(src).toContain('?? errorTag')
  })

  // ─── Observability hooks ─────────────────────────────────────────────────────

  it('imports _hooks from virtual:cer-app-config', () => {
    expect(src).toContain('_hooks')
    expect(src).toContain('virtual:cer-app-config')
  })

  it('fires onRequest at the start of the handler with path, method, and req', () => {
    expect(src).toContain('_hooks?.onRequest')
    expect(src).toContain('_requestPath')
    expect(src).toContain('_requestStart')
  })

  it('fires onError in the middleware catch with type: middleware', () => {
    expect(src).toContain("type: 'middleware'")
    // onError fires inside runServerMiddleware catch
    const mwIdx = src.indexOf('runServerMiddleware')
    const middlewareErrIdx = src.indexOf("type: 'middleware'", mwIdx)
    expect(middlewareErrIdx).toBeGreaterThan(mwIdx)
  })

  it('fires onError in the loader catch with type: loader', () => {
    expect(src).toContain("type: 'loader'")
  })

  it('fires onError in the render catch with type: render', () => {
    expect(src).toContain("type: 'render'")
    const catchIdx = src.indexOf('} catch (_renderErr) {')
    const renderErrIdx = src.indexOf("type: 'render'", catchIdx)
    expect(renderErrIdx).toBeGreaterThan(catchIdx)
  })

  it('fires onResponse after the success res.end()', () => {
    expect(src).toContain('_hooks?.onResponse')
    // onResponse must appear after DSD_POLYFILL_SCRIPT + fromBodyClose
    const endIdx = src.indexOf('DSD_POLYFILL_SCRIPT + fromBodyClose')
    const responseIdx = src.indexOf('_hooks?.onResponse', endIdx)
    expect(responseIdx).toBeGreaterThan(endIdx)
  })

  it('fires onResponse in the render error catch so it fires on both success and error paths', () => {
    const catchIdx = src.indexOf('} catch (_renderErr) {')
    const responseInCatchIdx = src.indexOf('_hooks?.onResponse', catchIdx)
    expect(responseInCatchIdx).toBeGreaterThan(catchIdx)
  })

  it('swallows exceptions thrown by onError so hooks cannot crash the handler', () => {
    expect(src).toContain('/* hooks must not crash the handler */')
  })
})
