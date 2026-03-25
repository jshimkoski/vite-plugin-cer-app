/**
 * OAuth handler tests — handleOAuthInitiate, handleOAuthCallback, handleOAuthLogout.
 *
 * All tests run inside a __CER_REQ_STORE__ AsyncLocalStorage context so
 * useSession() works correctly. fetch() is mocked throughout.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'

// ─── Mock useSession ─────────────────────────────────────────────────────────

let _mockSessionData: Record<string, unknown> | null = null
const _setCookies: string[] = []

const mockSession = {
  get: vi.fn(async () => _mockSessionData),
  set: vi.fn(async (data: unknown) => { _mockSessionData = data as Record<string, unknown> }),
  clear: vi.fn(async () => { _mockSessionData = null }),
}

vi.mock('../../../runtime/composables/use-session.js', () => ({
  useSession: vi.fn(() => mockSession),
}))

import { handleOAuthInitiate, handleOAuthCallback, handleOAuthLogout } from '../../../runtime/oauth/handler.js'
import type { ResolvedAuthConfig } from '../../../runtime/oauth/handler.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const g = globalThis as Record<string, unknown>

const AUTH_CONFIG: ResolvedAuthConfig = {
  providers: {
    google: {
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
    },
    github: {
      clientId: 'github-client-id',
      clientSecret: 'github-client-secret',
    },
  },
  redirectAfterLogin: '/dashboard',
  redirectAfterLogout: '/',
  sessionKey: 'auth',
}

function makeReqRes(url = '/api/auth/google') {
  const headers: Record<string, string> = { host: 'localhost:3000' }
  const req = {
    url,
    headers,
  } as unknown as IncomingMessage

  const responseHeaders: Record<string, string> = {}
  let statusCode = 200
  let body = ''

  const res = {
    get statusCode() { return statusCode },
    set statusCode(v: number) { statusCode = v },
    setHeader(name: string, value: string) {
      if (name.toLowerCase() === 'set-cookie') {
        _setCookies.push(value)
      }
      responseHeaders[name.toLowerCase()] = value
    },
    getHeader(name: string) { return responseHeaders[name.toLowerCase()] },
    end(chunk?: string) { if (chunk) body = chunk },
    _responseHeaders: responseHeaders,
    _body: () => body,
  } as unknown as ServerResponse & { _responseHeaders: Record<string, string>; _body: () => string }

  return { req, res }
}

function runInStore(req: unknown, res: unknown, fn: () => Promise<void>): Promise<void> {
  const { AsyncLocalStorage } = require('node:async_hooks')
  const store = new AsyncLocalStorage()
  g['__CER_REQ_STORE__'] = store
  return store.run({ req, res }, fn)
}

// ─── handleOAuthInitiate ──────────────────────────────────────────────────────

describe('handleOAuthInitiate()', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    _mockSessionData = null
    _setCookies.length = 0
    mockSession.get.mockImplementation(async () => _mockSessionData)
    mockSession.set.mockImplementation(async (d: unknown) => { _mockSessionData = d as Record<string, unknown> })
    mockSession.clear.mockImplementation(async () => { _mockSessionData = null })
  })

  afterEach(() => {
    delete g['__CER_REQ_STORE__']
  })

  it('redirects to Google authorization URL', async () => {
    const { req, res } = makeReqRes()
    await runInStore(req, res, async () => {
      await handleOAuthInitiate(req, res, 'google', AUTH_CONFIG)
    })
    expect((res as unknown as { _responseHeaders: Record<string, string> })._responseHeaders['location'])
      .toMatch(/^https:\/\/accounts\.google\.com/)
    expect((res as unknown as { statusCode: number }).statusCode).toBe(302)
  })

  it('includes PKCE code_challenge for Google', async () => {
    const { req, res } = makeReqRes()
    await runInStore(req, res, async () => {
      await handleOAuthInitiate(req, res, 'google', AUTH_CONFIG)
    })
    const location: string = (res as unknown as { _responseHeaders: Record<string, string> })._responseHeaders['location']
    const params = new URLSearchParams(location.split('?')[1])
    expect(params.get('code_challenge')).toBeTruthy()
    expect(params.get('code_challenge_method')).toBe('S256')
  })

  it('does NOT include PKCE for GitHub (pkce: false)', async () => {
    const { req, res } = makeReqRes('/api/auth/github')
    await runInStore(req, res, async () => {
      await handleOAuthInitiate(req, res, 'github', AUTH_CONFIG)
    })
    const location: string = (res as unknown as { _responseHeaders: Record<string, string> })._responseHeaders['location']
    const params = new URLSearchParams(location.split('?')[1])
    expect(params.get('code_challenge')).toBeNull()
  })

  it('includes state param in redirect URL', async () => {
    const { req, res } = makeReqRes()
    await runInStore(req, res, async () => {
      await handleOAuthInitiate(req, res, 'google', AUTH_CONFIG)
    })
    const location: string = (res as unknown as { _responseHeaders: Record<string, string> })._responseHeaders['location']
    const params = new URLSearchParams(location.split('?')[1])
    expect(params.get('state')).toBeTruthy()
    expect(params.get('state')!.length).toBeGreaterThan(0)
  })

  it('stores state + verifier in pkce session', async () => {
    const { req, res } = makeReqRes()
    await runInStore(req, res, async () => {
      await handleOAuthInitiate(req, res, 'google', AUTH_CONFIG)
    })
    expect(mockSession.set).toHaveBeenCalledWith(
      expect.objectContaining({ state: expect.any(String), verifier: expect.any(String), provider: 'google' }),
    )
  })

  it('returns 404 for an unknown provider', async () => {
    const { req, res } = makeReqRes()
    await runInStore(req, res, async () => {
      await handleOAuthInitiate(req, res, 'unknown-provider', AUTH_CONFIG)
    })
    expect((res as unknown as { statusCode: number }).statusCode).toBe(404)
  })
})

// ─── handleOAuthCallback ──────────────────────────────────────────────────────

describe('handleOAuthCallback()', () => {
  const state = 'test-state-value'
  const pkceData = { state, verifier: 'test-verifier', provider: 'google' }

  beforeEach(() => {
    vi.resetAllMocks()
    _mockSessionData = pkceData
    mockSession.get.mockImplementation(async () => _mockSessionData)
    mockSession.set.mockImplementation(async (d: unknown) => { _mockSessionData = d as Record<string, unknown> })
    mockSession.clear.mockImplementation(async () => { _mockSessionData = null })
  })

  afterEach(() => {
    delete g['__CER_REQ_STORE__']
    vi.unstubAllGlobals()
  })

  it('exchanges code for tokens, fetches profile, stores user, and redirects', async () => {
    const googleUser = { id: '123', name: 'Alice', email: 'alice@test.com', picture: 'https://pic.example.com/a.jpg' }
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', token_type: 'Bearer' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => googleUser }),
    )

    const { req, res } = makeReqRes(`/api/auth/callback/google?code=auth-code&state=${state}`)
    await runInStore(req, res, async () => {
      await handleOAuthCallback(req, res, 'google', AUTH_CONFIG)
    })

    expect((res as unknown as { statusCode: number }).statusCode).toBe(302)
    expect((res as unknown as { _responseHeaders: Record<string, string> })._responseHeaders['location'])
      .toBe('/dashboard')

    expect(mockSession.set).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', id: '123', name: 'Alice' }),
    )
  })

  it('returns 400 when state param is missing', async () => {
    const { req, res } = makeReqRes('/api/auth/callback/google?code=auth-code')
    await runInStore(req, res, async () => {
      await handleOAuthCallback(req, res, 'google', AUTH_CONFIG)
    })
    expect((res as unknown as { statusCode: number }).statusCode).toBe(400)
  })

  it('returns 400 when state does not match pkce session', async () => {
    const { req, res } = makeReqRes('/api/auth/callback/google?code=auth-code&state=wrong-state')
    await runInStore(req, res, async () => {
      await handleOAuthCallback(req, res, 'google', AUTH_CONFIG)
    })
    expect((res as unknown as { statusCode: number }).statusCode).toBe(400)
  })

  it('returns 400 when pkce session is absent (expired)', async () => {
    _mockSessionData = null

    const { req, res } = makeReqRes(`/api/auth/callback/google?code=auth-code&state=${state}`)
    await runInStore(req, res, async () => {
      await handleOAuthCallback(req, res, 'google', AUTH_CONFIG)
    })
    expect((res as unknown as { statusCode: number }).statusCode).toBe(400)
  })

  it('returns 502 when token exchange fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' }))

    const { req, res } = makeReqRes(`/api/auth/callback/google?code=bad-code&state=${state}`)
    await runInStore(req, res, async () => {
      await handleOAuthCallback(req, res, 'google', AUTH_CONFIG)
    })
    expect((res as unknown as { statusCode: number }).statusCode).toBe(502)
  })

  it('normalises GitHub profile correctly', async () => {
    const ghPkce = { state, verifier: 'v', provider: 'github' }
    _mockSessionData = ghPkce
    const ghUser = { id: 456, login: 'bob', name: null, email: 'bob@git.com', avatar_url: 'https://avatars.example.com/bob' }

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', token_type: 'token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ghUser }),
    )

    const { req, res } = makeReqRes(`/api/auth/callback/github?code=gh-code&state=${state}`)
    await runInStore(req, res, async () => {
      await handleOAuthCallback(req, res, 'github', AUTH_CONFIG)
    })

    expect(mockSession.set).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'github', id: '456', name: 'bob' }),
    )
  })

  it('returns 400 when code param is missing', async () => {
    const { req, res } = makeReqRes(`/api/auth/callback/google?state=${state}`)
    await runInStore(req, res, async () => {
      await handleOAuthCallback(req, res, 'google', AUTH_CONFIG)
    })
    expect((res as unknown as { statusCode: number }).statusCode).toBe(400)
  })

  it('returns 502 when token exchange response contains invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token') },
    }))

    const { req, res } = makeReqRes(`/api/auth/callback/google?code=auth-code&state=${state}`)
    await runInStore(req, res, async () => {
      await handleOAuthCallback(req, res, 'google', AUTH_CONFIG)
    })
    expect((res as unknown as { statusCode: number }).statusCode).toBe(502)
  })

  it('returns 502 when user-info response contains invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', token_type: 'Bearer' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('Unexpected token') } }),
    )

    const { req, res } = makeReqRes(`/api/auth/callback/google?code=auth-code&state=${state}`)
    await runInStore(req, res, async () => {
      await handleOAuthCallback(req, res, 'google', AUTH_CONFIG)
    })
    expect((res as unknown as { statusCode: number }).statusCode).toBe(502)
  })

  it('returns 502 when user-info request fails (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok', token_type: 'Bearer' }) })
      .mockRejectedValueOnce(new TypeError('fetch failed')),
    )

    const { req, res } = makeReqRes(`/api/auth/callback/google?code=auth-code&state=${state}`)
    await runInStore(req, res, async () => {
      await handleOAuthCallback(req, res, 'google', AUTH_CONFIG)
    })
    expect((res as unknown as { statusCode: number }).statusCode).toBe(502)
  })

  it('returns 404 for unknown provider in callback', async () => {
    const unknownPkce = { state, verifier: 'v', provider: 'unknown-provider' }
    _mockSessionData = unknownPkce

    const { req, res } = makeReqRes(`/api/auth/callback/unknown-provider?code=code&state=${state}`)
    await runInStore(req, res, async () => {
      await handleOAuthCallback(req, res, 'unknown-provider', AUTH_CONFIG)
    })
    expect((res as unknown as { statusCode: number }).statusCode).toBe(404)
  })

  it('uses custom scope from provider config', async () => {
    const customConfig: ResolvedAuthConfig = {
      ...AUTH_CONFIG,
      providers: {
        google: {
          clientId: 'google-client-id',
          clientSecret: 'google-client-secret',
          scope: ['email'],
        },
      },
    }

    const { req, res } = makeReqRes('/api/auth/google')
    await runInStore(req, res, async () => {
      await handleOAuthInitiate(req, res, 'google', customConfig)
    })
    const location: string = (res as unknown as { _responseHeaders: Record<string, string> })._responseHeaders['location']
    const params = new URLSearchParams(location.split('?')[1])
    expect(params.get('scope')).toBe('email')
  })
})

// ─── handleOAuthLogout ────────────────────────────────────────────────────────

describe('handleOAuthLogout()', () => {
  afterEach(() => {
    delete g['__CER_REQ_STORE__']
  })

  it('clears auth session and redirects to redirectAfterLogout', async () => {
    _mockSessionData = { provider: 'google', id: '1' }
    mockSession.clear.mockImplementation(async () => { _mockSessionData = null })

    const { req, res } = makeReqRes('/api/auth/logout')
    await runInStore(req, res, async () => {
      await handleOAuthLogout(req, res, AUTH_CONFIG)
    })

    expect(mockSession.clear).toHaveBeenCalled()
    expect((res as unknown as { statusCode: number }).statusCode).toBe(302)
    expect((res as unknown as { _responseHeaders: Record<string, string> })._responseHeaders['location']).toBe('/')
  })
})
