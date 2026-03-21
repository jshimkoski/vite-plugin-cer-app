import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'pathe'

const src = readFileSync(
  resolve(import.meta.dirname, '../../runtime/entry-server-template.ts'),
  'utf-8',
)

describe('entry-server-template (ENTRY_SERVER_TEMPLATE content)', () => {
  it('imports virtual:cer-components', () => {
    expect(src).toContain('virtual:cer-components')
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
    expect(src).toContain('@jasonshimmy/custom-elements-runtime')
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

  it('uses _cerDataStore.enterWith() to scope loader data', () => {
    expect(src).toContain('_cerDataStore.enterWith(data)')
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
    expect(src).toContain('_mergeWithClientTemplate(ssrHtml, _clientTemplate)')
  })

  it('exports handler as both named and default export', () => {
    expect(src).toContain('export const handler')
    expect(src).toContain('export default handler')
  })

  it('exports apiRoutes, plugins, layouts, and routes', () => {
    expect(src).toContain('export { apiRoutes, plugins, layouts, routes }')
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
})
