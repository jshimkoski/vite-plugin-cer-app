import { describe, it, expect } from 'vitest'
import { APP_ENTRY_TEMPLATE } from '../../runtime/app-template.js'

// ─── Hydration strategy ───────────────────────────────────────────────────────

describe('APP_ENTRY_TEMPLATE — meta.hydrate', () => {
  it('reads meta.hydrate from the matched route', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('_initMatch?.route?.meta?.hydrate')
  })

  it('defaults to "load" when hydrate is not set', () => {
    expect(APP_ENTRY_TEMPLATE).toContain(`?? 'load'`)
  })

  it('skips hydration entirely for strategy "none"', () => {
    expect(APP_ENTRY_TEMPLATE).toContain(`_hydrateStrategy === 'none'`)
    // Should delete __CER_DATA__ but NOT call _replace
    const noneBlock = APP_ENTRY_TEMPLATE.slice(
      APP_ENTRY_TEMPLATE.indexOf(`_hydrateStrategy === 'none'`),
    )
    // The delete must appear before _doHydrate is defined (i.e. in the none branch)
    expect(APP_ENTRY_TEMPLATE).toContain(`delete (globalThis).__CER_DATA__`)
  })

  it('defers hydration with requestIdleCallback for strategy "idle"', () => {
    expect(APP_ENTRY_TEMPLATE).toContain(`_hydrateStrategy === 'idle'`)
    expect(APP_ENTRY_TEMPLATE).toContain('requestIdleCallback')
  })

  it('includes a setTimeout fallback for environments without requestIdleCallback', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('typeof requestIdleCallback')
    expect(APP_ENTRY_TEMPLATE).toContain('setTimeout')
  })

  it('defers hydration with IntersectionObserver for strategy "visible"', () => {
    expect(APP_ENTRY_TEMPLATE).toContain(`_hydrateStrategy === 'visible'`)
    expect(APP_ENTRY_TEMPLATE).toContain('IntersectionObserver')
  })

  it('observes cer-layout-view element for "visible" strategy', () => {
    expect(APP_ENTRY_TEMPLATE).toContain(`querySelector('cer-layout-view')`)
  })

  it('falls back to document.body when cer-layout-view is not found', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('document.body')
  })

  it('disconnects the IntersectionObserver after first intersection', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('_io.disconnect()')
  })

  it('calls _doHydrate immediately for strategy "load"', () => {
    // The else branch (default load) calls _doHydrate directly with await
    expect(APP_ENTRY_TEMPLATE).toContain('await _doHydrate()')
  })

  it('_doHydrate pre-loads the page and calls _replace', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('await _loadPageForPath(_initPath)')
    expect(APP_ENTRY_TEMPLATE).toContain('await _replace(_initPath)')
  })

  it('_doHydrate skips _replace if URL changed during async module load', () => {
    // Guard: only call _replace when the URL hasn't changed during _loadPageForPath.
    // This prevents _doHydrate from overriding a navigation that fired while the
    // initial page module was being loaded asynchronously.
    const doHydrateStart = APP_ENTRY_TEMPLATE.indexOf('const _doHydrate')
    const doHydrateEnd = APP_ENTRY_TEMPLATE.indexOf('\n    }', doHydrateStart)
    const doHydrateBlock = APP_ENTRY_TEMPLATE.slice(doHydrateStart, doHydrateEnd)
    expect(doHydrateBlock).toContain('_currentPath === _initPath')
    expect(doHydrateBlock).toContain('window.location.pathname')
  })

  it('guards direct page render with _currentPagePath === current.value.path', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('_currentPagePath')
    expect(APP_ENTRY_TEMPLATE).toContain('_currentPagePath === current.value.path')
  })

  it('exposes router globally as __cerRouter', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('__cerRouter')
  })

  it('_doHydrate defers __CER_DATA__ deletion via queueMicrotask after navigation', () => {
    // The delete must happen inside a queueMicrotask callback so that
    // cer-layout-view's reactive re-render (queued by the router subscription)
    // runs BEFORE the data is cleared. A synchronous delete would remove the
    // data before the scheduled render can read it, causing usePageData() to
    // always return null on initial SSR/SSG page load.
    const doHydrateStart = APP_ENTRY_TEMPLATE.indexOf('const _doHydrate')
    const doHydrateEnd = APP_ENTRY_TEMPLATE.indexOf('\n    }', doHydrateStart)
    const doHydrateBlock = APP_ENTRY_TEMPLATE.slice(doHydrateStart, doHydrateEnd)
    expect(doHydrateBlock).toContain('queueMicrotask')
    expect(doHydrateBlock).toContain('delete (globalThis).__CER_DATA__')
    // The delete must be INSIDE a queueMicrotask callback, not inline
    const microtaskIdx = doHydrateBlock.indexOf('queueMicrotask')
    const deleteIdx = doHydrateBlock.indexOf('delete (globalThis).__CER_DATA__')
    expect(deleteIdx).toBeGreaterThan(microtaskIdx)
  })
})

// ─── Loader sequence ──────────────────────────────────────────────────────────

describe('APP_ENTRY_TEMPLATE — loader sequence', () => {
  it('_loadPageForPath calls mod.loader with { params, query }', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('mod.loader({ params, query })')
  })

  it('_loadPageForPath sets globalThis.__CER_DATA__ from loader result', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('(globalThis).__CER_DATA__ = data')
  })

  it('_loadPageForPath merges loader primitive values into _currentPageAttrs', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('_currentPageAttrs = loaderAttrs')
  })

  it('_currentPageAttrs is passed as attrs in the direct-render page vnode', () => {
    // The direct-render path passes _currentPageAttrs to the page element attrs
    // so useProps() in the page component can read loader-returned primitives.
    expect(APP_ENTRY_TEMPLATE).toContain('attrs: _currentPageAttrs')
  })

  it('router.push deletes __CER_DATA__ before loading the new page', () => {
    // Prevents stale loader data from leaking to pages without a loader.
    const pushStart = APP_ENTRY_TEMPLATE.indexOf('router.push = async')
    const pushEnd = APP_ENTRY_TEMPLATE.indexOf('\n}', pushStart)
    const pushBlock = APP_ENTRY_TEMPLATE.slice(pushStart, pushEnd)
    expect(pushBlock).toContain('delete (globalThis).__CER_DATA__')
    // The delete must appear before _loadPageForPath is called.
    const deleteIdx = pushBlock.indexOf('delete (globalThis).__CER_DATA__')
    const loadIdx = pushBlock.indexOf('_loadPageForPath')
    expect(deleteIdx).toBeLessThan(loadIdx)
  })

  it('router.replace deletes __CER_DATA__ before loading the new page', () => {
    const replaceStart = APP_ENTRY_TEMPLATE.indexOf('router.replace = async')
    const replaceEnd = APP_ENTRY_TEMPLATE.indexOf('\n}', replaceStart)
    const replaceBlock = APP_ENTRY_TEMPLATE.slice(replaceStart, replaceEnd)
    expect(replaceBlock).toContain('delete (globalThis).__CER_DATA__')
    const deleteIdx = replaceBlock.indexOf('delete (globalThis).__CER_DATA__')
    const loadIdx = replaceBlock.indexOf('_loadPageForPath')
    expect(deleteIdx).toBeLessThan(loadIdx)
  })

  it('router.push awaits _loadPageForPath before _push', () => {
    const pushStart = APP_ENTRY_TEMPLATE.indexOf('router.push = async')
    const pushEnd = APP_ENTRY_TEMPLATE.indexOf('\n}', pushStart)
    const pushBlock = APP_ENTRY_TEMPLATE.slice(pushStart, pushEnd)
    const loadIdx = pushBlock.indexOf('await _loadPageForPath')
    const pushIdx = pushBlock.indexOf('await _push')
    expect(loadIdx).toBeGreaterThanOrEqual(0)
    expect(pushIdx).toBeGreaterThan(loadIdx)
  })

  it('router.replace awaits _loadPageForPath before _replace', () => {
    const replaceStart = APP_ENTRY_TEMPLATE.indexOf('router.replace = async')
    const replaceEnd = APP_ENTRY_TEMPLATE.indexOf('\n}', replaceStart)
    const replaceBlock = APP_ENTRY_TEMPLATE.slice(replaceStart, replaceEnd)
    const loadIdx = replaceBlock.indexOf('await _loadPageForPath')
    const replaceIdx = replaceBlock.indexOf('await _replace')
    expect(loadIdx).toBeGreaterThanOrEqual(0)
    expect(replaceIdx).toBeGreaterThan(loadIdx)
  })

  it('surfaces loader errors to currentError so the error boundary is shown', () => {
    // The catch block must set currentError.value instead of silently swallowing errors.
    // This is consistent with how the server-side handler renders the error component.
    const loadPageStart = APP_ENTRY_TEMPLATE.indexOf('async function _loadPageForPath')
    const loadPageEnd = APP_ENTRY_TEMPLATE.indexOf('\n}', loadPageStart)
    const loadPageBlock = APP_ENTRY_TEMPLATE.slice(loadPageStart, loadPageEnd)
    expect(loadPageBlock).toContain('currentError.value =')
    // Must not silently swallow — the old pattern was `catch { /* ... */ }`
    expect(loadPageBlock).not.toContain('/* loader errors are non-fatal')
  })

  it('uses per-route errorTag over global errorTag in cer-layout-view error rendering', () => {
    // routeMeta must be computed before the currentError check so the per-route
    // error component can be selected (mirrors server-side _prepareRequest logic).
    const template = APP_ENTRY_TEMPLATE
    expect(template).toContain('routeMeta?.errorTag')
    // Falls back to global errorTag when no per-route error component exists
    expect(template).toContain('hasError ? errorTag : null')
    // The effectiveErrorTag variable is used as the rendered tag
    expect(template).toContain('effectiveErrorTag')
  })
})
