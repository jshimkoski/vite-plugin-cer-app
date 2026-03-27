import type { IncomingMessage, ServerResponse } from 'node:http'

export interface CookieOptions {
  /** Cookie path. Defaults to '/' when setting/removing. */
  path?: string
  domain?: string
  /** Max age in seconds. */
  maxAge?: number
  expires?: Date
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
}

export interface CookieRef {
  /** The current cookie value, or undefined if not set. */
  readonly value: string | undefined
  /** Write the cookie value. */
  set(value: string, options?: CookieOptions): void
  /** Remove the cookie by setting Max-Age=0. */
  remove(options?: CookieOptions): void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseCookies(cookieHeader: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=')
    if (eqIdx < 0) continue
    const key = part.slice(0, eqIdx).trim()
    const rawValue = part.slice(eqIdx + 1).trim()
    try {
      result[key] = decodeURIComponent(rawValue)
    } catch {
      result[key] = rawValue
    }
  }
  return result
}

function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  let str = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`
  const path = options.path ?? '/'
  if (path) str += `; Path=${path}`
  if (options.domain) str += `; Domain=${options.domain}`
  if (options.maxAge !== undefined) str += `; Max-Age=${options.maxAge}`
  if (options.expires) str += `; Expires=${options.expires.toUTCString()}`
  if (options.httpOnly) str += '; HttpOnly'
  if (options.secure) str += '; Secure'
  // Default SameSite to 'Lax' to prevent CSRF exposure on browsers that do not
  // enforce a default (older Safari, Firefox < 79). 'Lax' allows top-level
  // navigations while blocking third-party POSTs — the right default for most apps.
  // Callers can override with sameSite: 'None' (requires Secure) or 'Strict'.
  const sameSite = options.sameSite ?? 'Lax'
  str += `; SameSite=${sameSite}`
  return str
}

function appendSetCookie(res: ServerResponse, cookie: string): void {
  const existing = res.getHeader('Set-Cookie')
  const list: string[] = existing == null
    ? []
    : Array.isArray(existing) ? existing : [String(existing)]
  list.push(cookie)
  res.setHeader('Set-Cookie', list)
}

// ─── Composable ───────────────────────────────────────────────────────────────

/**
 * Isomorphic cookie composable.
 *
 * - **Server (SSR/SSG)**: reads from `req.headers.cookie` via AsyncLocalStorage;
 *   writes/removes via `res.setHeader('Set-Cookie', ...)`.
 * - **Client**: reads and writes `document.cookie`.
 *
 * It is auto-imported, so you don't need to import it manually.
 *
 * @example
 * ```ts
 * const token = useCookie('auth-token')
 * console.log(token.value)           // read
 * token.set('abc123')                // write
 * token.remove()                     // delete
 * ```
 */
export function useCookie(name: string, defaultOptions: CookieOptions = {}): CookieRef {
  const g = globalThis as Record<string, unknown>

  // ── SSR path ──────────────────────────────────────────────────────────────
  const store = g['__CER_REQ_STORE__'] as
    | { getStore(): { req: IncomingMessage; res: ServerResponse } | null }
    | undefined

  if (store) {
    const ctx = store.getStore()
    if (ctx) {
      const { req, res } = ctx
      const parsed = parseCookies(req.headers['cookie'] ?? '')
      return {
        value: parsed[name],
        set(value: string, options?: CookieOptions) {
          appendSetCookie(res, serializeCookie(name, value, { ...defaultOptions, ...options }))
        },
        remove(options?: CookieOptions) {
          appendSetCookie(res, serializeCookie(name, '', { ...defaultOptions, ...options, maxAge: 0 }))
        },
      }
    }
  }

  // ── Client path ───────────────────────────────────────────────────────────
  if (typeof document !== 'undefined') {
    const parsed = parseCookies(document.cookie)
    return {
      value: parsed[name],
      set(value: string, options?: CookieOptions) {
        document.cookie = serializeCookie(name, value, { ...defaultOptions, ...options })
      },
      remove(options?: CookieOptions) {
        document.cookie = serializeCookie(name, '', { ...defaultOptions, ...options, maxAge: 0 })
      },
    }
  }

  // ── Build-time / unknown context ──────────────────────────────────────────
  return {
    value: undefined,
    set() {},
    remove() {},
  }
}
