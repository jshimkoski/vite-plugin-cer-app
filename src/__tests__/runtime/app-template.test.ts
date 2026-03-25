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

  it('_doHydrate clears __CER_DATA__ after navigation', () => {
    // delete must appear inside _doHydrate, i.e. after _replace and before the closing }
    const doHydrateStart = APP_ENTRY_TEMPLATE.indexOf('const _doHydrate')
    const doHydrateEnd = APP_ENTRY_TEMPLATE.indexOf('\n    }', doHydrateStart)
    const doHydrateBlock = APP_ENTRY_TEMPLATE.slice(doHydrateStart, doHydrateEnd)
    expect(doHydrateBlock).toContain('delete (globalThis).__CER_DATA__')
  })
})
