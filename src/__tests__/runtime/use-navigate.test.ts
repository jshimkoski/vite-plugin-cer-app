/**
 * navigateTo() tests.
 *
 * Covers:
 * - Server path: sends a 302 redirect via the req/res store
 * - Client path: delegates to __cerRouter.push
 * - Fallback: sets window.location.href
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { navigateTo } from '../../runtime/composables/use-navigate.js'

const g = globalThis as Record<string, unknown>

function makeReqStore(res: Record<string, unknown>) {
  const { AsyncLocalStorage } = require('node:async_hooks')
  const store = new AsyncLocalStorage()
  store.enterWith({ req: {}, res })
  return store
}

// ─── Server path ──────────────────────────────────────────────────────────────

describe('navigateTo() — server path (__CER_REQ_STORE__)', () => {
  let _orig: unknown

  beforeEach(() => {
    _orig = g['__CER_REQ_STORE__']
    delete g['__cerRouter']
  })

  afterEach(() => {
    g['__CER_REQ_STORE__'] = _orig
  })

  it('sets statusCode 302 and Location header on the response', () => {
    const res = {
      statusCode: 200,
      writableEnded: false,
      setHeader: vi.fn(),
      end: vi.fn(),
    }
    g['__CER_REQ_STORE__'] = makeReqStore(res)

    navigateTo('/dashboard')

    expect(res.statusCode).toBe(302)
    expect(res.setHeader).toHaveBeenCalledWith('Location', '/dashboard')
    expect(res.end).toHaveBeenCalled()
  })

  it('does not redirect when response is already ended', () => {
    const res = {
      statusCode: 200,
      writableEnded: true,
      setHeader: vi.fn(),
      end: vi.fn(),
    }
    g['__CER_REQ_STORE__'] = makeReqStore(res)

    navigateTo('/dashboard')

    expect(res.setHeader).not.toHaveBeenCalled()
    expect(res.end).not.toHaveBeenCalled()
  })
})

// ─── Client path ──────────────────────────────────────────────────────────────

describe('navigateTo() — client path (__cerRouter)', () => {
  beforeEach(() => {
    delete g['__CER_REQ_STORE__']
  })

  afterEach(() => {
    delete g['__cerRouter']
  })

  it('calls router.push with the given path', async () => {
    const push = vi.fn(async () => {})
    g['__cerRouter'] = { push }

    await navigateTo('/home')

    expect(push).toHaveBeenCalledWith('/home')
  })

  it('returns the promise from router.push', () => {
    const push = vi.fn(async () => {})
    g['__cerRouter'] = { push }

    const result = navigateTo('/settings')
    expect(result).toBeInstanceOf(Promise)
  })
})

// ─── Fallback ─────────────────────────────────────────────────────────────────

describe('navigateTo() — window.location fallback', () => {
  beforeEach(() => {
    delete g['__CER_REQ_STORE__']
    delete g['__cerRouter']
  })

  afterEach(() => {
    if ('window' in g) delete (g as { window?: unknown })['window']
  })

  it('sets window.location.href when no router is available', () => {
    let redirectedTo = ''
    ;(g as Record<string, unknown>)['window'] = {
      location: {
        get href() { return redirectedTo },
        set href(v: string) { redirectedTo = v },
      },
    }

    navigateTo('/login')
    expect(redirectedTo).toBe('/login')
  })
})
