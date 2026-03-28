/**
 * useSession() composable tests.
 *
 * Exercises HMAC-SHA-256 sign/verify round-trips, cookie storage, the clear()
 * helper, and the sessionSecret warning path. Uses happy-dom for the client
 * path (document.cookie).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─── Mock runtimeConfig ───────────────────────────────────────────────────────
// useSession reads the sessionSecret from useRuntimeConfig().private.
// We mock the composable module so tests can control the secret.

let _mockSecret = 'test-secret-at-least-32-chars-long!'

vi.mock('../../runtime/composables/use-runtime-config.js', () => ({
  useRuntimeConfig: () => ({ private: { sessionSecret: _mockSecret } }),
  initRuntimeConfig: vi.fn(),
  resolvePrivateConfig: vi.fn((d) => d),
}))

import { useSession } from '../../runtime/composables/use-session.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal AsyncLocalStorage-backed req/res context for SSR path testing. */
function makeCtx(cookieHeader = '') {
  const setCookies: string[] = []
  const req = { headers: { cookie: cookieHeader } } as unknown as import('node:http').IncomingMessage
  const res = {
    setHeader(name: string, value: string | string[]) {
      if (name.toLowerCase() === 'set-cookie') {
        const vals = Array.isArray(value) ? value : [value]
        setCookies.push(...vals)
      }
    },
    getHeader(name: string) {
      if (name.toLowerCase() === 'set-cookie') return setCookies
      return undefined
    },
  } as unknown as import('node:http').ServerResponse
  return { req, res, setCookies }
}

function runInStore(req: unknown, res: unknown, fn: () => Promise<void>): Promise<void> {
  const store = (globalThis as Record<string, unknown>).__CER_REQ_STORE__ as
    { run: (ctx: unknown, fn: () => Promise<void>) => Promise<void> } | undefined
  if (store) return store.run({ req, res }, fn)
  return fn()
}

// ─── SSR path ─────────────────────────────────────────────────────────────────

describe('useSession() — SSR path', () => {
  let _origStore: unknown

  beforeEach(() => {
    _origStore = (globalThis as Record<string, unknown>).__CER_REQ_STORE__
    const { AsyncLocalStorage } = require('node:async_hooks')
    const store = new AsyncLocalStorage()
    ;(globalThis as Record<string, unknown>).__CER_REQ_STORE__ = store
    _mockSecret = 'test-secret-at-least-32-chars-long!'
  })

  afterEach(() => {
    ;(globalThis as Record<string, unknown>).__CER_REQ_STORE__ = _origStore
  })

  it('get() returns null when cookie is absent', async () => {
    const { req, res } = makeCtx('')
    let result: unknown
    await runInStore(req, res, async () => {
      result = await useSession().get()
    })
    expect(result).toBeNull()
  })

  it('set() then get() round-trips session data', async () => {
    const { req, res, setCookies } = makeCtx('')
    let token = ''

    // set
    await runInStore(req, res, async () => {
      await useSession<{ userId: string }>().set({ userId: 'u1' })
    })

    // extract token from Set-Cookie header
    const setCookie = setCookies.find((c) => c.startsWith('session='))
    expect(setCookie).toBeTruthy()
    token = setCookie!.split(';')[0].slice('session='.length)
    expect(token).toContain('.') // payload.sig format

    // get with the cookie present
    const { req: req2, res: res2 } = makeCtx(`session=${token}`)
    let data: { userId: string } | null = null
    await runInStore(req2, res2, async () => {
      data = await useSession<{ userId: string }>().get()
    })
    expect(data).toEqual({ userId: 'u1' })
  })

  it('get() returns null for a malformed token with no dot separator', async () => {
    const { req, res } = makeCtx('session=nodotinthisvalue')
    let data: unknown = 'not-null'
    await runInStore(req, res, async () => {
      data = await useSession().get()
    })
    expect(data).toBeNull()
  })

  it('get() returns null for a token with valid format but invalid base64url payload', async () => {
    // Payload is not valid base64url, signature is also garbage — should return null safely
    const { req, res } = makeCtx('session=!!!invalid!!!.sig')
    let data: unknown = 'not-null'
    await runInStore(req, res, async () => {
      data = await useSession().get()
    })
    expect(data).toBeNull()
  })

  it('get() returns null for a tampered token', async () => {
    const { req, res, setCookies } = makeCtx('')
    await runInStore(req, res, async () => {
      await useSession<{ userId: string }>().set({ userId: 'u1' })
    })
    const setCookie = setCookies.find((c) => c.startsWith('session='))!
    const token = setCookie.split(';')[0].slice('session='.length)
    const tampered = token.slice(0, -4) + 'XXXX'

    const { req: req2, res: res2 } = makeCtx(`session=${tampered}`)
    let data: unknown = 'not-null'
    await runInStore(req2, res2, async () => {
      data = await useSession().get()
    })
    expect(data).toBeNull()
  })

  it('get() returns null when signed with a different secret', async () => {
    const { req, res, setCookies } = makeCtx('')
    await runInStore(req, res, async () => {
      await useSession<{ userId: string }>().set({ userId: 'u1' })
    })
    const setCookie = setCookies.find((c) => c.startsWith('session='))!
    const token = setCookie.split(';')[0].slice('session='.length)

    _mockSecret = 'a-completely-different-secret-value!'
    const { req: req2, res: res2 } = makeCtx(`session=${token}`)
    let data: unknown = 'not-null'
    await runInStore(req2, res2, async () => {
      data = await useSession().get()
    })
    expect(data).toBeNull()
  })

  it('clear() sets maxAge=0 in the Set-Cookie header', async () => {
    const { req, res, setCookies } = makeCtx('')
    await runInStore(req, res, async () => {
      await useSession().clear()
    })
    const setCookie = setCookies.find((c) => c.startsWith('session='))
    expect(setCookie).toBeTruthy()
    expect(setCookie!.toLowerCase()).toContain('max-age=0')
  })

  it('set() writes httpOnly cookie', async () => {
    const { req, res, setCookies } = makeCtx('')
    await runInStore(req, res, async () => {
      await useSession<{ role: string }>().set({ role: 'admin' })
    })
    const setCookie = setCookies.find((c) => c.startsWith('session='))!
    expect(setCookie.toLowerCase()).toContain('httponly')
  })

  it('set() respects custom name and maxAge options', async () => {
    const { req, res, setCookies } = makeCtx('')
    await runInStore(req, res, async () => {
      await useSession({ name: 'auth', maxAge: 3600 }).set({ x: 1 })
    })
    const setCookie = setCookies.find((c) => c.startsWith('auth='))
    expect(setCookie).toBeTruthy()
    expect(setCookie!.toLowerCase()).toContain('max-age=3600')
  })

  it('set() throws when sessionSecret is empty', async () => {
    _mockSecret = ''
    const { req, res } = makeCtx('')
    await expect(
      runInStore(req, res, async () => {
        await useSession().set({ x: 1 })
      }),
    ).rejects.toThrow('sessionSecret')
  })

  it('get() returns null (not throws) when sessionSecret is empty', async () => {
    _mockSecret = ''
    const { req, res } = makeCtx('session=sometoken.sig')
    let data: unknown = 'sentinel'
    await runInStore(req, res, async () => {
      data = await useSession().get()
    })
    expect(data).toBeNull()
  })

  it('handles arbitrary JSON-serialisable session data', async () => {
    const payload = { userId: 'u2', roles: ['admin', 'user'], ts: 1234567890 }
    const { req, res, setCookies } = makeCtx('')
    await runInStore(req, res, async () => {
      await useSession<typeof payload>().set(payload)
    })
    const setCookie = setCookies.find((c) => c.startsWith('session='))!
    const token = setCookie.split(';')[0].slice('session='.length)

    const { req: req2, res: res2 } = makeCtx(`session=${token}`)
    let data: typeof payload | null = null
    await runInStore(req2, res2, async () => {
      data = await useSession<typeof payload>().get()
    })
    expect(data).toEqual(payload)
  })
})

// ─── P1-3: Session secret rotation ────────────────────────────────────────────

describe('useSession() — secret rotation (P1-3)', () => {
  let _origStore: unknown

  beforeEach(() => {
    _origStore = (globalThis as Record<string, unknown>).__CER_REQ_STORE__
    const { AsyncLocalStorage } = require('node:async_hooks')
    const store = new AsyncLocalStorage()
    ;(globalThis as Record<string, unknown>).__CER_REQ_STORE__ = store
  })

  afterEach(() => {
    ;(globalThis as Record<string, unknown>).__CER_REQ_STORE__ = _origStore
  })

  it('signs with the first secret in the array', async () => {
    _mockSecret = ['new-secret-at-least-32-chars-long!!', 'old-secret-at-least-32-chars-long!!'] as unknown as string
    const { req, res, setCookies } = makeCtx('')
    await runInStore(req, res, async () => {
      await useSession<{ userId: string }>().set({ userId: 'u1' })
    })
    const setCookie = setCookies.find((c) => c.startsWith('session='))
    expect(setCookie).toBeTruthy()
    const token = setCookie!.split(';')[0].slice('session='.length)
    expect(token).toContain('.')
  })

  it('verifies tokens signed with the second (old) secret', async () => {
    // First, sign with the old secret alone
    _mockSecret = 'old-secret-at-least-32-chars-long!!'
    const { req, res, setCookies } = makeCtx('')
    await runInStore(req, res, async () => {
      await useSession<{ userId: string }>().set({ userId: 'rotated' })
    })
    const setCookie = setCookies.find((c) => c.startsWith('session='))!
    const oldToken = setCookie.split(';')[0].slice('session='.length)

    // Now set secrets to [newSecret, oldSecret] — old token should still verify
    _mockSecret = ['new-secret-at-least-32-chars-long!!', 'old-secret-at-least-32-chars-long!!'] as unknown as string
    const { req: req2, res: res2 } = makeCtx(`session=${oldToken}`)
    let data: { userId: string } | null = null
    await runInStore(req2, res2, async () => {
      data = await useSession<{ userId: string }>().get()
    })
    expect(data).toEqual({ userId: 'rotated' })
  })

  it('rejects a token when it matches neither secret in the array', async () => {
    _mockSecret = 'old-secret-at-least-32-chars-long!!'
    const { req, res, setCookies } = makeCtx('')
    await runInStore(req, res, async () => {
      await useSession<{ userId: string }>().set({ userId: 'gone' })
    })
    const setCookie = setCookies.find((c) => c.startsWith('session='))!
    const token = setCookie.split(';')[0].slice('session='.length)

    // Completely different secrets — token should fail
    _mockSecret = ['completely-different-secret-one123', 'completely-different-secret-two123'] as unknown as string
    const { req: req2, res: res2 } = makeCtx(`session=${token}`)
    let data: unknown = 'sentinel'
    await runInStore(req2, res2, async () => {
      data = await useSession().get()
    })
    expect(data).toBeNull()
  })

  it('treats a single string as the only secret (no rotation)', async () => {
    _mockSecret = 'single-secret-at-least-32-chars-!!'
    const { req, res, setCookies } = makeCtx('')
    await runInStore(req, res, async () => {
      await useSession<{ userId: string }>().set({ userId: 'single' })
    })
    const token = setCookies.find((c) => c.startsWith('session='))!.split(';')[0].slice('session='.length)
    const { req: req2, res: res2 } = makeCtx(`session=${token}`)
    let data: { userId: string } | null = null
    await runInStore(req2, res2, async () => {
      data = await useSession<{ userId: string }>().get()
    })
    expect(data).toEqual({ userId: 'single' })
  })
})

// ─── Client path ──────────────────────────────────────────────────────────────
// On the client, useSession().get() can only read an already-set cookie value.
// Signing is skipped (no crypto key on the client); get() returns null.

describe('useSession() — client path (no __CER_REQ_STORE__)', () => {
  beforeEach(() => {
    // Ensure no SSR store is active
    delete (globalThis as Record<string, unknown>).__CER_REQ_STORE__
  })

  it('get() returns null when no session cookie is set', async () => {
    const result = await useSession().get()
    expect(result).toBeNull()
  })
})
