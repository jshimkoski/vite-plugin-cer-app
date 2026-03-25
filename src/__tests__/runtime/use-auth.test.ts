/**
 * useAuth() composable tests.
 *
 * Covers both the server path (AsyncLocalStorage __CER_AUTH_STORE__) and
 * the client hydration path (globalThis.__CER_AUTH_USER__).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─── Mock useSession so logout() server-path can be exercised without real crypto ──

vi.mock('../../runtime/composables/use-session.js', () => ({
  useSession: vi.fn(() => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  })),
}))

import { useAuth } from '../../runtime/composables/use-auth.js'
import { useSession } from '../../runtime/composables/use-session.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const g = globalThis as Record<string, unknown>

function makeAuthStore(user: unknown) {
  const { AsyncLocalStorage } = require('node:async_hooks')
  const store = new AsyncLocalStorage()
  store.enterWith(user)
  return store
}

// ─── Server path ──────────────────────────────────────────────────────────────

describe('useAuth() — server path (__CER_AUTH_STORE__)', () => {
  let _orig: unknown

  beforeEach(() => {
    _orig = g['__CER_AUTH_STORE__']
  })

  afterEach(() => {
    g['__CER_AUTH_STORE__'] = _orig
    // Ensure window is absent
    if ('window' in g) delete (g as { window?: unknown })['window']
  })

  it('returns the user from the ALS store', () => {
    const user = { provider: 'google', id: '1', name: 'Alice' }
    g['__CER_AUTH_STORE__'] = makeAuthStore(user)

    const { user: u, loggedIn } = useAuth()
    expect(u).toEqual(user)
    expect(loggedIn).toBe(true)
  })

  it('returns null user when store holds null', () => {
    g['__CER_AUTH_STORE__'] = makeAuthStore(null)

    const { user, loggedIn } = useAuth()
    expect(user).toBeNull()
    expect(loggedIn).toBe(false)
  })

  it('logout() calls useSession().clear() on server', async () => {
    const clearFn = vi.fn(async () => {})
    ;(useSession as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      clear: clearFn,
    })

    const store = makeAuthStore({ provider: 'github', id: '2' })
    g['__CER_AUTH_STORE__'] = store

    const auth = useAuth()
    await auth.logout()

    expect(clearFn).toHaveBeenCalled()
  })

  it('logout() sets user to null after clearing session', async () => {
    g['__CER_AUTH_STORE__'] = makeAuthStore({ provider: 'github', id: '2' })

    const auth = useAuth()
    expect(auth.user).not.toBeNull()

    await auth.logout()
    expect(auth.user).toBeNull()
  })

  it('login() is a no-op on the server (no window)', () => {
    g['__CER_AUTH_STORE__'] = makeAuthStore(null)
    // Should not throw
    expect(() => useAuth().login('google')).not.toThrow()
  })

  it('uses custom sessionKey when provided', async () => {
    const clearFn = vi.fn(async () => {})
    ;(useSession as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      clear: clearFn,
    })

    g['__CER_AUTH_STORE__'] = makeAuthStore({ provider: 'github', id: '5' })

    await useAuth('custom-session-key').logout()

    expect(useSession as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'custom-session-key' }),
    )
  })

  it('logout() propagates error when session.clear() rejects', async () => {
    ;(useSession as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      clear: vi.fn(async () => { throw new Error('cookie error') }),
    })

    g['__CER_AUTH_STORE__'] = makeAuthStore({ provider: 'google', id: '6' })

    await expect(useAuth().logout()).rejects.toThrow('cookie error')
  })
})

// ─── Client path ──────────────────────────────────────────────────────────────

describe('useAuth() — client path (__CER_AUTH_USER__)', () => {
  beforeEach(() => {
    delete g['__CER_AUTH_STORE__']
  })

  afterEach(() => {
    delete g['__CER_AUTH_USER__']
  })

  it('reads user from globalThis.__CER_AUTH_USER__', () => {
    const user = { provider: 'discord', id: '3', name: 'Bob' }
    g['__CER_AUTH_USER__'] = user

    const { user: u, loggedIn } = useAuth()
    expect(u).toEqual(user)
    expect(loggedIn).toBe(true)
  })

  it('returns null when __CER_AUTH_USER__ is not set', () => {
    const { user, loggedIn } = useAuth()
    expect(user).toBeNull()
    expect(loggedIn).toBe(false)
  })

  it('login() redirects to /api/auth/:provider on the client', () => {
    let redirectedTo = ''
    ;(g as Record<string, unknown>)['window'] = {
      location: {
        get href() { return redirectedTo },
        set href(v: string) { redirectedTo = v },
      },
    }

    useAuth().login('google')
    expect(redirectedTo).toBe('/api/auth/google')

    delete (g as Record<string, unknown>)['window']
  })
})
