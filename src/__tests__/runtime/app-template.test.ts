import { describe, it, expect } from 'vitest'
import { generateAppEntryTemplate } from '../../runtime/app-template.js'

const APP_ENTRY_TEMPLATE = generateAppEntryTemplate()

// ─── Hydration strategy ───────────────────────────────────────────────────────

describe('APP_ENTRY_TEMPLATE — meta.hydrate', () => {
  it('reads meta.hydrate from the matched route', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('_initMatch?.route?.meta?.hydrate')
  })

  it('defaults to "load" when hydrate is not set', () => {
    expect(APP_ENTRY_TEMPLATE).toContain(`?? 'load'`)
  })

  it('keeps the static page unhydrated while activating nested islands after paint', () => {
    expect(APP_ENTRY_TEMPLATE).toContain(`_hydrateStrategy === 'none'`)
    // Preserve SSR loader state in case the router preloads/upgrades the page
    // module; the next real navigation is responsible for clearing it.
    const noneBlock = APP_ENTRY_TEMPLATE.slice(
      APP_ENTRY_TEMPLATE.indexOf(`_hydrateStrategy === 'none'`),
      APP_ENTRY_TEMPLATE.indexOf('} else {', APP_ENTRY_TEMPLATE.indexOf(`_hydrateStrategy === 'none'`)),
    )
    expect(noneBlock).not.toContain(`delete (globalThis).__CER_DATA__`)
    expect(noneBlock).toContain('_initMatch?.route?.load')
    expect(noneBlock).toContain('requestAnimationFrame')
    expect(noneBlock).not.toContain('_activateClientRouteRendering')
  })

  it('does not keep a hydrate-none tree served as fallback for a different URL', () => {
    expect(APP_ENTRY_TEMPLATE).toContain(
      "_hydrateStrategy === 'none' && _canKeepStaticEntry",
    )
    expect(APP_ENTRY_TEMPLATE).toContain(
      '_hasInitialLoaderData && _serverTreeMatchesEntry',
    )
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
    expect(APP_ENTRY_TEMPLATE).toContain('await _loadPageForPath(')
    expect(APP_ENTRY_TEMPLATE).toContain('_initPath,')
    expect(APP_ENTRY_TEMPLATE).toContain('await _replace(_initPath)')
  })

  it('_doHydrate reuses existing SSR loader data instead of re-running the initial loader', () => {
    expect(APP_ENTRY_TEMPLATE).toContain("Object.prototype.hasOwnProperty.call(globalThis, '__CER_DATA__')")
    expect(APP_ENTRY_TEMPLATE).toContain('runLoader: false')
    expect(APP_ENTRY_TEMPLATE).toContain('initialData: (globalThis).__CER_DATA__')
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

  it('_doHydrate cannot overwrite a navigation requested before the URL commits', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('let _navigationIntent = 0')
    expect(APP_ENTRY_TEMPLATE).toContain('const _hydrationIntent = _navigationIntent')
    expect(APP_ENTRY_TEMPLATE).toContain('_navigationIntent === _hydrationIntent')
  })

  it('guards direct page render with _currentPagePath === current.value.path', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('_currentPagePath')
    expect(APP_ENTRY_TEMPLATE).toContain('_currentPagePath === current.value.path')
  })

  it('keeps the SSR slot during the router subscribe initial state push', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('let _sawInitialRouteState = false')
    expect(APP_ENTRY_TEMPLATE).toContain('const _isInitialSubscribePush = !_sawInitialRouteState')
    expect(APP_ENTRY_TEMPLATE).toContain('if (_isInitialSubscribePush) {')
    expect(APP_ENTRY_TEMPLATE).toContain('return')
  })

  it('keeps the upgraded SSR tree as the initial live application when the route stays put', () => {
    const doHydrateStart = APP_ENTRY_TEMPLATE.indexOf('const _doHydrate')
    const doHydrateEnd = APP_ENTRY_TEMPLATE.indexOf(
      "if (_hydrateStrategy === 'idle')",
      doHydrateStart,
    )
    const doHydrateBlock = APP_ENTRY_TEMPLATE.slice(doHydrateStart, doHydrateEnd)

    expect(doHydrateBlock).toContain('_hasInitialServerTree')
    expect(APP_ENTRY_TEMPLATE).not.toContain(
      'if (_cerHydrating.value && _currentPageTag !== null) _cerHydrating.value = false',
    )
  })

  it('switches an empty SPA shell to client rendering after initial route setup', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('const _hasInitialServerTree =')
    expect(APP_ENTRY_TEMPLATE).toContain('!_hasInitialServerTree')
    expect(APP_ENTRY_TEMPLATE).toContain('_activateClientRouteRendering()')
  })

  it('replaces a static-host fallback tree rendered for a different route', () => {
    expect(APP_ENTRY_TEMPLATE).toContain("getAttribute('data-cer-route')")
    expect(APP_ENTRY_TEMPLATE).toContain('decodeURIComponent(_serverTreePath)')
    expect(APP_ENTRY_TEMPLATE).toContain('!_serverTreeMatchesEntry')
  })

  it('loads and renders the middleware redirect destination during initial hydration', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('_resolvedInitialPath !== _requestedInitialPath')
    expect(APP_ENTRY_TEMPLATE).toContain('await _loadPageForPath(_resolvedInitialPath)')
  })

  it('does not let hydration fallback loading supersede an in-flight navigation loader', () => {
    expect(APP_ENTRY_TEMPLATE).toContain(
      '_navigationIntent === _hydrationIntent &&\n          _currentPagePath !== _resolvedInitialPath',
    )
  })

  it('releases stale SSR content when a redirect completes during the initial chunk load', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('const _urlLeftInitialEntry = _currentPath !== _initPath')
    expect(APP_ENTRY_TEMPLATE).toContain('_urlLeftInitialEntry ||')

    const stabilityGuard = APP_ENTRY_TEMPLATE.indexOf('if (_currentPath === _initPath)')
    const staleTreeCheck = APP_ENTRY_TEMPLATE.indexOf('const _urlLeftInitialEntry', stabilityGuard)
    const activate = APP_ENTRY_TEMPLATE.indexOf('_activateClientRouteRendering()', staleTreeCheck)
    expect(staleTreeCheck).toBeGreaterThan(stabilityGuard)
    expect(activate).toBeGreaterThan(staleTreeCheck)
  })

  it('switches to client rendering and releases the SSR tree on real navigation', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('function _activateClientRouteRendering()')
    expect(APP_ENTRY_TEMPLATE).toContain('_cerHydrating.value = false')
    expect(APP_ENTRY_TEMPLATE).toContain('host.replaceChildren()')

    const pushStart = APP_ENTRY_TEMPLATE.indexOf('router.push = async')
    const pushEnd = APP_ENTRY_TEMPLATE.indexOf('\n}', pushStart)
    expect(APP_ENTRY_TEMPLATE.slice(pushStart, pushEnd)).toContain(
      '_activateClientRouteRendering()',
    )

    const replaceStart = APP_ENTRY_TEMPLATE.indexOf('router.replace = async')
    const replaceEnd = APP_ENTRY_TEMPLATE.indexOf('\n}', replaceStart)
    expect(APP_ENTRY_TEMPLATE.slice(replaceStart, replaceEnd)).toContain(
      '_activateClientRouteRendering()',
    )
  })

  it('exposes router globally as __cerRouter', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('__cerRouter')
  })

  it('_doHydrate keeps initial __CER_DATA__ available after hydration', () => {
    // The initial page data must survive hydration because some browsers may
    // perform a later upgrade/re-render of the hydrated page component. The
    // next real client navigation clears __CER_DATA__ before loading new data.
    const doHydrateStart = APP_ENTRY_TEMPLATE.indexOf('const _doHydrate')
    const doHydrateEnd = APP_ENTRY_TEMPLATE.indexOf('\n    }', doHydrateStart)
    const doHydrateBlock = APP_ENTRY_TEMPLATE.slice(doHydrateStart, doHydrateEnd)
    expect(doHydrateBlock).not.toContain('queueMicrotask(() => { delete (globalThis).__CER_DATA__ })')
  })
})

describe('APP_ENTRY_TEMPLATE — progressive link navigation', () => {
  it('passes the resolved router configuration to the runtime router', () => {
    expect(APP_ENTRY_TEMPLATE).toContain("import { runtimeConfig, appConfig } from 'virtual:cer-app-config'")
    expect(APP_ENTRY_TEMPLATE).toContain('initRouter({ ...appConfig.router, routes })')
  })

  it('intercepts unhandled internal shadow-DOM anchors before islands hydrate', () => {
    expect(APP_ENTRY_TEMPLATE).toContain("document.addEventListener('click'")
    expect(APP_ENTRY_TEMPLATE).toContain('event.composedPath()')
    expect(APP_ENTRY_TEMPLATE).toContain('event.defaultPrevented')
    expect(APP_ENTRY_TEMPLATE).toContain("anchor.getAttribute('target')")
    expect(APP_ENTRY_TEMPLATE).toContain('void router.push(')
  })

  it('routes same-page fragments through the runtime scroll implementation', () => {
    const listenerStart = APP_ENTRY_TEMPLATE.indexOf("document.addEventListener('click'")
    const listenerEnd = APP_ENTRY_TEMPLATE.indexOf('// ─── Plugins', listenerStart)
    const listener = APP_ENTRY_TEMPLATE.slice(listenerStart, listenerEnd)

    expect(listener).toContain('event.preventDefault()')
    expect(listener).toContain('void _push(url.pathname + url.search + url.hash)')
    expect(listener).not.toContain('Preserve native fragment navigation')
  })
})

// ─── Loader sequence ──────────────────────────────────────────────────────────

describe('APP_ENTRY_TEMPLATE — loader sequence', () => {
  it('uses latest-request-wins page loading so stale imports cannot replace a newer route', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('let _pageLoadVersion = 0')
    expect(APP_ENTRY_TEMPLATE).toContain('const loadVersion = ++_pageLoadVersion')
    expect(APP_ENTRY_TEMPLATE).toContain('if (loadVersion !== _pageLoadVersion) return')
  })

  it('_loadPageForPath calls mod.loader with { params, query }', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('mod.loader({ params, query })')
  })

  it('_loadPageForPath sets globalThis.__CER_DATA__ from loader result', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('(globalThis).__CER_DATA__ = loaderData')
  })

  it('_loadPageForPath derives primitive attrs from reused loader data too', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('function _toLoaderAttrs(data)')
    expect(APP_ENTRY_TEMPLATE).toContain('loaderAttrs = { ...loaderAttrs, ..._toLoaderAttrs(loaderData) }')
  })

  it('_loadPageForPath merges loader primitive values into _currentPageAttrs', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('_currentPageAttrs = loaderAttrs')
  })

  it('_currentPageAttrs is passed as attrs in the direct-render page vnode', () => {
    // The direct-render path passes _currentPageAttrs to the page element attrs
    // so useProps() in the page component can read loader-returned primitives.
    expect(APP_ENTRY_TEMPLATE).toContain('attrs: _currentPageAttrs')
  })

  it('keys each published page load so reused catch-all tags receive fresh loader state', () => {
    expect(APP_ENTRY_TEMPLATE).toContain('_currentPageKey = loadVersion')
    expect(APP_ENTRY_TEMPLATE).toContain(
      '{ tag: _currentPageTag, key: _currentPageKey, props: { attrs: _currentPageAttrs }, children: [] }',
    )
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
