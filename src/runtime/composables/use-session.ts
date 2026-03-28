import { useCookie } from './use-cookie.js'
import { useRuntimeConfig } from './use-runtime-config.js'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options for `useSession()`. Controls the cookie name and expiry. */
export interface SessionOptions {
  /**
   * Cookie name for the session. Defaults to `'session'`.
   */
  name?: string
  /**
   * Max-age in seconds. Defaults to 7 days (604 800 s).
   */
  maxAge?: number
}

/**
 * HMAC-signed cookie session returned by `useSession()`.
 * All methods are async because signing and verification use the Web Crypto API.
 */
export interface SessionComposable<T extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * Reads and verifies the session cookie. Returns the session data or `null`
   * if the cookie is absent, expired, or its signature is invalid.
   */
  get(): Promise<T | null>
  /**
   * Signs `data` and writes it as a session cookie. Existing session data is
   * replaced entirely.
   */
  set(data: T): Promise<void>
  /**
   * Clears the session cookie by setting `maxAge = 0`.
   */
  clear(): Promise<void>
}

// ─── HMAC-SHA-256 helpers (Web Crypto — available in Node ≥ 18 and Workers) ──

const ENC = new TextEncoder()

async function _importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    ENC.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function _b64u(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function _b64uDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '='))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/**
 * Signs a JSON-serialisable payload. Returns `<payload_b64u>.<sig_b64u>`.
 */
async function _sign(key: CryptoKey, data: unknown): Promise<string> {
  const payload = _b64u(ENC.encode(JSON.stringify(data)).buffer as ArrayBuffer)
  const sig = await crypto.subtle.sign('HMAC', key, ENC.encode(payload))
  return `${payload}.${_b64u(sig)}`
}

/**
 * Verifies a signed cookie value. Returns the payload or `null` on failure.
 */
async function _verify<T>(key: CryptoKey, token: string): Promise<T | null> {
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const payload = token.slice(0, dot)
  const sig = _b64uDecode(token.slice(dot + 1))
  const ok = await crypto.subtle.verify('HMAC', key, sig.buffer as ArrayBuffer, ENC.encode(payload))
  if (!ok) return null
  try {
    return JSON.parse(new TextDecoder().decode(_b64uDecode(payload))) as T
  } catch {
    return null
  }
}

// ─── Composable ───────────────────────────────────────────────────────────────

/**
 * Signed-cookie session composable.
 *
 * Session data is JSON-serialised, HMAC-SHA-256 signed, and stored in a single
 * HTTP cookie. The signing key is read from `runtimeConfig.private.sessionSecret`
 * (declared as an empty-string default; resolved from `SESSION_SECRET` env var
 * at server startup).
 *
 * Works isomorphically: on the server it uses `useCookie()` which reads/writes
 * HTTP headers via `AsyncLocalStorage`; on the client it reads the cookie from
 * `document.cookie` (client-side session reading only — no signing key in client).
 *
 * @example
 * ```ts
 * // server/middleware/auth.ts
 * export default defineServerMiddleware(async (req, res, next) => {
 *   const session = useSession<{ userId: string }>()
 *   const data = await session.get()
 *   if (!data?.userId) { res.statusCode = 401; res.end(); return }
 *   ;(req as any).user = data
 *   next()
 * })
 *
 * // app/pages/login.ts — loader
 * export const loader = async ({ req }) => {
 *   const session = useSession<{ userId: string }>()
 *   await session.set({ userId: user.id })
 *   return { ok: true }
 * }
 * ```
 */
export function useSession<T extends Record<string, unknown> = Record<string, unknown>>(
  options: SessionOptions = {},
): SessionComposable<T> {
  const name = options.name ?? 'session'
  const maxAge = options.maxAge ?? 60 * 60 * 24 * 7 // 7 days

  /**
   * Returns the list of signing secrets in priority order.
   * The first secret is the active key (used for signing new sessions).
   * Subsequent secrets are accepted for verification only (rotation window).
   */
  function _getSecrets(): string[] {
    try {
      const cfg = useRuntimeConfig()
      const raw = (cfg as { private?: { sessionSecret?: string | string[] } }).private?.sessionSecret ?? ''
      const secrets = Array.isArray(raw) ? raw.filter(Boolean) : (raw ? [raw] : [])
      if (secrets.length === 0) {
        console.warn(
          '[cer-app] useSession: runtimeConfig.private.sessionSecret is empty. ' +
          'Declare it with an empty-string default and set SESSION_SECRET in your environment.',
        )
      }
      return secrets
    } catch {
      return []
    }
  }

  return {
    async get(): Promise<T | null> {
      const cookie = useCookie(name)
      const raw = cookie.value
      if (!raw) return null
      const secrets = _getSecrets()
      if (secrets.length === 0) return null
      // Try each secret in order — first match wins (supports rotation).
      for (const secret of secrets) {
        try {
          const key = await _importKey(secret)
          const result = await _verify<T>(key, raw)
          if (result !== null) return result
        } catch {
          // Try next key
        }
      }
      return null
    },

    async set(data: T): Promise<void> {
      const secrets = _getSecrets()
      if (secrets.length === 0) throw new Error('[cer-app] useSession: sessionSecret is not configured.')
      // Always sign with the first (active) key.
      const key = await _importKey(secrets[0])
      const token = await _sign(key, data)
      const cookie = useCookie(name, { maxAge, httpOnly: true, sameSite: 'Lax', path: '/' })
      cookie.set(token)
    },

    async clear(): Promise<void> {
      const cookie = useCookie(name, { httpOnly: true, sameSite: 'Lax', path: '/' })
      cookie.remove()
    },
  }
}
