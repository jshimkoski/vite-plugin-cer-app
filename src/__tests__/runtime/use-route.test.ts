/**
 * useRoute() composable tests.
 *
 * Covers:
 * - Server path: reads from __CER_ROUTE_STORE__ AsyncLocalStorage
 * - Client path: reads from globalThis.__cerRouter
 * - Fallback: returns default route when neither is present
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useRoute } from '../../runtime/composables/use-route.js'

const g = globalThis as Record<string, unknown>

function makeRouteStore(info: unknown) {
  const { AsyncLocalStorage } = require('node:async_hooks')
  const store = new AsyncLocalStorage()
  store.enterWith(info)
  return store
}

// ─── Server path ──────────────────────────────────────────────────────────────

describe('useRoute() — server path (__CER_ROUTE_STORE__)', () => {
  let _orig: unknown

  beforeEach(() => {
    _orig = g['__CER_ROUTE_STORE__']
  })

  afterEach(() => {
    g['__CER_ROUTE_STORE__'] = _orig
    delete g['__cerRouter']
  })

  it('returns route info from the ALS store', () => {
    const info = { path: '/posts/42', params: { id: '42' }, query: {}, meta: { title: 'Post' } }
    g['__CER_ROUTE_STORE__'] = makeRouteStore(info)

    const route = useRoute()
    expect(route.path).toBe('/posts/42')
    expect(route.params).toEqual({ id: '42' })
    expect(route.meta).toEqual({ title: 'Post' })
  })

  it('falls through to client router when routeStore.getStore() returns null', () => {
    // Store is present but no active context (getStore returns null)
    const { AsyncLocalStorage } = require('node:async_hooks')
    const emptyStore = new AsyncLocalStorage()
    g['__CER_ROUTE_STORE__'] = emptyStore
    // Provide a client router so we get a real result instead of the fallback
    g['__cerRouter'] = {
      getCurrent: () => ({ path: '/client-path', query: {} }),
      matchRoute: () => ({ route: { meta: null }, params: {} }),
    }

    const route = useRoute()
    expect(route.path).toBe('/client-path')
  })

  it('returns query params from route info', () => {
    const info = { path: '/search', params: {}, query: { q: 'hello' }, meta: null }
    g['__CER_ROUTE_STORE__'] = makeRouteStore(info)

    const route = useRoute()
    expect(route.query).toEqual({ q: 'hello' })
  })

  it('returns null meta when not set', () => {
    g['__CER_ROUTE_STORE__'] = makeRouteStore({ path: '/', params: {}, query: {}, meta: null })

    const { meta } = useRoute()
    expect(meta).toBeNull()
  })
})

// ─── Client path ──────────────────────────────────────────────────────────────

describe('useRoute() — client path (__cerRouter)', () => {
  beforeEach(() => {
    delete g['__CER_ROUTE_STORE__']
  })

  afterEach(() => {
    delete g['__cerRouter']
  })

  it('reads from the global router on the client', () => {
    g['__cerRouter'] = {
      getCurrent: () => ({ path: '/about', query: { ref: 'nav' } }),
      matchRoute: () => ({ route: { meta: { title: 'About' } }, params: {} }),
    }

    const route = useRoute()
    expect(route.path).toBe('/about')
    expect(route.query).toEqual({ ref: 'nav' })
    expect(route.meta).toEqual({ title: 'About' })
  })

  it('defaults query to {} when getCurrent() omits the query property', () => {
    g['__cerRouter'] = {
      getCurrent: () => ({ path: '/home' }),
      matchRoute: () => ({ route: { meta: null }, params: {} }),
    }

    const route = useRoute()
    expect(route.query).toEqual({})
  })

  it('extracts params from matched route', () => {
    g['__cerRouter'] = {
      getCurrent: () => ({ path: '/posts/7', query: {} }),
      matchRoute: () => ({ route: { meta: null }, params: { id: '7' } }),
    }

    const { params } = useRoute()
    expect(params).toEqual({ id: '7' })
  })

  it('returns null meta when route has none', () => {
    g['__cerRouter'] = {
      getCurrent: () => ({ path: '/', query: {} }),
      matchRoute: () => ({ route: { meta: null }, params: {} }),
    }

    expect(useRoute().meta).toBeNull()
  })

  it('handles unmatched route gracefully', () => {
    g['__cerRouter'] = {
      getCurrent: () => ({ path: '/unknown', query: {} }),
      matchRoute: () => null,
    }

    const route = useRoute()
    expect(route.params).toEqual({})
    expect(route.meta).toBeNull()
  })
})

// ─── Fallback ─────────────────────────────────────────────────────────────────

describe('useRoute() — fallback (no store, no router)', () => {
  beforeEach(() => {
    delete g['__CER_ROUTE_STORE__']
    delete g['__cerRouter']
  })

  it('returns a default route object', () => {
    const route = useRoute()
    expect(route.path).toBe('/')
    expect(route.params).toEqual({})
    expect(route.query).toEqual({})
    expect(route.meta).toBeNull()
  })
})
