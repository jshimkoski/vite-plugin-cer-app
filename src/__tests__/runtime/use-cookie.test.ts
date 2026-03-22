/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AsyncLocalStorage } from 'node:async_hooks'
import { useCookie } from '../../runtime/composables/use-cookie.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReqRes(cookieHeader = ''): { req: IncomingMessage; res: ServerResponse } {
  const req = { headers: { cookie: cookieHeader } } as unknown as IncomingMessage
  const headers: Record<string, string | string[]> = {}
  const res = {
    getHeader: (name: string) => headers[name.toLowerCase()],
    setHeader(name: string, value: string | string[]) { headers[name.toLowerCase()] = value },
  } as unknown as ServerResponse
  return { req, res }
}

// ─── SSR path ─────────────────────────────────────────────────────────────────

describe('useCookie — SSR (via AsyncLocalStorage)', () => {
  const store = new AsyncLocalStorage<{ req: IncomingMessage; res: ServerResponse }>()

  beforeEach(() => {
    ;(globalThis as Record<string, unknown>)['__CER_REQ_STORE__'] = store
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['__CER_REQ_STORE__']
  })

  it('reads a cookie from the request', () => {
    const { req, res } = makeReqRes('token=abc123; other=xyz')
    store.run({ req, res }, () => {
      const cookie = useCookie('token')
      expect(cookie.value).toBe('abc123')
    })
  })

  it('returns undefined for a missing cookie', () => {
    const { req, res } = makeReqRes('other=xyz')
    store.run({ req, res }, () => {
      const cookie = useCookie('missing')
      expect(cookie.value).toBeUndefined()
    })
  })

  it('writes a Set-Cookie header on set()', () => {
    const { req, res } = makeReqRes()
    store.run({ req, res }, () => {
      useCookie('session').set('s1')
    })
    const header = res.getHeader('Set-Cookie') as string[]
    expect(header).toBeDefined()
    const value = Array.isArray(header) ? header[0] : header
    expect(value).toContain('session=s1')
    expect(value).toContain('Path=/')
  })

  it('appends to existing Set-Cookie headers', () => {
    const { req, res } = makeReqRes()
    store.run({ req, res }, () => {
      useCookie('a').set('1')
      useCookie('b').set('2')
    })
    const header = res.getHeader('Set-Cookie') as string[]
    expect(Array.isArray(header)).toBe(true)
    expect(header).toHaveLength(2)
    expect(header[0]).toContain('a=1')
    expect(header[1]).toContain('b=2')
  })

  it('writes Max-Age=0 on remove()', () => {
    const { req, res } = makeReqRes('session=old')
    store.run({ req, res }, () => {
      useCookie('session').remove()
    })
    const header = res.getHeader('Set-Cookie') as string[]
    const value = Array.isArray(header) ? header[0] : header
    expect(value).toContain('Max-Age=0')
  })

  it('forwards options (httpOnly, secure, sameSite) when setting', () => {
    const { req, res } = makeReqRes()
    store.run({ req, res }, () => {
      useCookie('auth').set('tok', { httpOnly: true, secure: true, sameSite: 'Strict' })
    })
    const header = res.getHeader('Set-Cookie') as string[]
    const value = Array.isArray(header) ? header[0] : header
    expect(value).toContain('HttpOnly')
    expect(value).toContain('Secure')
    expect(value).toContain('SameSite=Strict')
  })

  it('forwards options (maxAge, path, domain) when removing', () => {
    const { req, res } = makeReqRes('auth=tok')
    store.run({ req, res }, () => {
      useCookie('auth').remove({ path: '/app', domain: 'example.com' })
    })
    const header = res.getHeader('Set-Cookie') as string[]
    const value = Array.isArray(header) ? header[0] : header
    expect(value).toContain('Max-Age=0')
    expect(value).toContain('Path=/app')
    expect(value).toContain('Domain=example.com')
  })

  it('decodes percent-encoded cookie values', () => {
    const { req, res } = makeReqRes(`msg=${encodeURIComponent('hello world')}`)
    store.run({ req, res }, () => {
      const cookie = useCookie('msg')
      expect(cookie.value).toBe('hello world')
    })
  })

  it('round-trips values with special characters (spaces, slashes, unicode)', () => {
    const specialValue = 'hello world/path?q=1&r=2 ✓'
    const { req, res } = makeReqRes(`special=${encodeURIComponent(specialValue)}`)
    store.run({ req, res }, () => {
      const cookie = useCookie('special')
      expect(cookie.value).toBe(specialValue)
    })
  })

  it('encodes special characters in Set-Cookie when setting a value', () => {
    const { req, res } = makeReqRes()
    const specialValue = 'hello world/path?q=1'
    store.run({ req, res }, () => {
      useCookie('data').set(specialValue)
    })
    const header = res.getHeader('Set-Cookie') as string[]
    const cookieStr = Array.isArray(header) ? header[0] : header
    // Value must be percent-encoded in the Set-Cookie header
    expect(cookieStr).toContain(encodeURIComponent(specialValue))
    expect(cookieStr).not.toContain(specialValue)
  })

  it('survives a malformed cookie segment without throwing', () => {
    // A segment with no '=' should be skipped gracefully
    const { req, res } = makeReqRes('broken; valid=ok; =noname')
    store.run({ req, res }, () => {
      const cookie = useCookie('valid')
      expect(cookie.value).toBe('ok')
      expect(useCookie('broken').value).toBeUndefined()
    })
  })

  it('returns undefined value outside a store context', () => {
    // store is registered but no run() context — getStore() returns null
    const cookie = useCookie('x')
    expect(cookie.value).toBeUndefined()
  })

  it('applies defaultOptions when no call-time options are passed to set()', () => {
    const { req, res } = makeReqRes()
    store.run({ req, res }, () => {
      useCookie('auth', { httpOnly: true, secure: true, sameSite: 'Strict' }).set('tok')
    })
    const header = res.getHeader('Set-Cookie') as string[]
    const value = Array.isArray(header) ? header[0] : header
    expect(value).toContain('HttpOnly')
    expect(value).toContain('Secure')
    expect(value).toContain('SameSite=Strict')
  })

  it('call-time options override defaultOptions', () => {
    const { req, res } = makeReqRes()
    store.run({ req, res }, () => {
      useCookie('pref', { sameSite: 'Strict', httpOnly: true }).set('v', { sameSite: 'Lax' })
    })
    const header = res.getHeader('Set-Cookie') as string[]
    const value = Array.isArray(header) ? header[0] : header
    // call-time sameSite: 'Lax' must win over the default 'Strict'
    expect(value).toContain('SameSite=Lax')
    expect(value).not.toContain('SameSite=Strict')
    // defaultOptions httpOnly is still inherited
    expect(value).toContain('HttpOnly')
  })

  it('defaultOptions are applied on remove() when no call-time options are passed', () => {
    const { req, res } = makeReqRes('secure=tok')
    store.run({ req, res }, () => {
      useCookie('secure', { path: '/app', domain: 'example.com' }).remove()
    })
    const header = res.getHeader('Set-Cookie') as string[]
    const value = Array.isArray(header) ? header[0] : header
    expect(value).toContain('Max-Age=0')
    expect(value).toContain('Path=/app')
    expect(value).toContain('Domain=example.com')
  })
})

// ─── Client path ──────────────────────────────────────────────────────────────

describe('useCookie — client (document.cookie)', () => {
  beforeEach(() => {
    // Ensure no SSR store leaks into client tests
    delete (globalThis as Record<string, unknown>)['__CER_REQ_STORE__']
    // Clear document cookies
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0].trim()
      if (name) document.cookie = `${name}=; Max-Age=0; Path=/`
    })
  })

  it('reads a cookie set via document.cookie', () => {
    document.cookie = 'theme=dark'
    const cookie = useCookie('theme')
    expect(cookie.value).toBe('dark')
  })

  it('returns undefined when the cookie is not set', () => {
    const cookie = useCookie('nonexistent')
    expect(cookie.value).toBeUndefined()
  })

  it('writes to document.cookie on set()', () => {
    useCookie('lang').set('en')
    const cookie = useCookie('lang')
    expect(cookie.value).toBe('en')
  })

  it('removes a cookie on remove()', () => {
    document.cookie = 'removeme=yes'
    useCookie('removeme').remove()
    const cookie = useCookie('removeme')
    // After removal the cookie value should be empty or undefined
    expect(cookie.value === undefined || cookie.value === '').toBe(true)
  })

  it('percent-encodes values with special characters', () => {
    useCookie('data').set('hello world')
    const raw = document.cookie
    expect(raw).toContain('hello%20world')
  })
})

// ─── Build-time / unknown context ─────────────────────────────────────────────

describe('useCookie — unknown context (no store, no document)', () => {
  it('returns undefined value and no-op set/remove when neither SSR nor client context is available', () => {
    delete (globalThis as Record<string, unknown>)['__CER_REQ_STORE__']
    // Simulate a non-browser, non-SSR context by verifying the composable
    // falls through to the default branch (value === undefined, methods are no-ops).
    // We can verify this by calling with a store that has no active context.
    const store = new AsyncLocalStorage()
    ;(globalThis as Record<string, unknown>)['__CER_REQ_STORE__'] = store
    // getStore() returns null because we're outside a run() context
    const cookie = useCookie('x')
    expect(cookie.value).toBeUndefined()
    expect(() => cookie.set('val')).not.toThrow()
    expect(() => cookie.remove()).not.toThrow()
    delete (globalThis as Record<string, unknown>)['__CER_REQ_STORE__']
  })
})
