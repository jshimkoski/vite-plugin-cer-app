/**
 * OAuth 2.0 request handlers — initiate, callback, and logout.
 *
 * All three functions run inside a `runWithRequestContext` scope so
 * `useSession()` and `useCookie()` work correctly (they read/write HTTP
 * headers via AsyncLocalStorage).
 *
 * Security:
 *  - PKCE (S256) is used for all providers that support it (Google, Discord).
 *    GitHub does not support PKCE so it is omitted for that provider.
 *  - The `state` parameter is a 16-byte random value stored in a short-lived
 *    (`_oauth_pkce`) session cookie.  The callback verifies it before
 *    exchanging the code, preventing CSRF.
 *  - `clientSecret` never appears in any client bundle — this file is only
 *    imported by the server-side virtual:cer-server-api module.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { useSession } from '../composables/use-session.js'
import { OAUTH_PROVIDERS } from './providers.js'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Normalised OAuth user written to the auth session cookie after a
 * successful callback.  Also exported from `composables/use-auth.ts` under
 * the same name — both definitions are structurally identical and
 * TypeScript treats them as compatible.
 */
export interface AuthUser {
  /** OAuth provider name, e.g. `'google'`, `'github'`, `'discord'`. */
  provider: string
  /** Provider-issued user id, always coerced to a string. */
  id: string
  name?: string
  email?: string
  /** URL of the user's profile picture / avatar. */
  avatar?: string
  [key: string]: unknown
}

/**
 * Subset of `OAuthProviderConfig` that is serialised into the virtual
 * `server-api` module at build time.  Only the fields needed at request
 * time are included — the full plugin config is NOT exposed to the server
 * bundle.
 */
interface ResolvedProviderConfig {
  clientId: string
  clientSecret: string
  scope?: string[]
  authorizationUrl?: string
  tokenUrl?: string
  userInfoUrl?: string
}

/**
 * Shape of the `_authCfg` constant injected into the virtual server-api
 * module by the plugin.
 *
 * - `providers` — map of provider name → credentials + optional overrides.
 *   Built-in providers (`google`, `github`, `discord`) only need
 *   `clientId` / `clientSecret`; custom providers must supply all three
 *   endpoint URLs.
 * - `redirectAfterLogin` — relative or absolute URL to redirect to after a
 *   successful OAuth callback (e.g. `'/dashboard'`).
 * - `redirectAfterLogout` — URL to redirect to after the logout endpoint
 *   clears the session cookie (e.g. `'/'`).
 * - `sessionKey` — name of the auth session cookie; must match
 *   `auth.sessionKey` in `cer.config.ts` (defaults to `'auth'`).
 */
export interface ResolvedAuthConfig {
  providers?: Record<string, ResolvedProviderConfig | undefined>
  redirectAfterLogin: string
  redirectAfterLogout: string
  sessionKey: string
}

interface PkceSessionData {
  state: string
  verifier: string
  provider: string
  [key: string]: unknown
}

// ─── Web Crypto helpers ───────────────────────────────────────────────────────

const ENC = new TextEncoder()

/** Encode an ArrayBuffer as a URL-safe base64 string (no padding). */
function _b64u(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Generate a 32-byte cryptographically random PKCE code verifier.
 * Encoded as base64url per RFC 7636 §4.1.
 */
async function generateCodeVerifier(): Promise<string> {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return _b64u(bytes.buffer as ArrayBuffer)
}

/**
 * Derive the PKCE S256 code challenge from the verifier.
 * `code_challenge = BASE64URL(SHA-256(ASCII(code_verifier)))` — RFC 7636 §4.2.
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', ENC.encode(verifier))
  return _b64u(hash)
}

/**
 * Generate a 16-byte cryptographically random state parameter.
 * Used to bind the initiate and callback requests (CSRF protection).
 */
function generateState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return _b64u(bytes.buffer as ArrayBuffer)
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

function getCallbackUrl(req: IncomingMessage, provider: string): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http'
  const host = (req.headers.host as string | undefined) ?? 'localhost'
  return `${proto}://${host}/api/auth/callback/${provider}`
}

function getQueryParam(req: IncomingMessage, name: string): string | null {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    return url.searchParams.get(name)
  } catch {
    return null
  }
}

// ─── Profile normalisation ────────────────────────────────────────────────────

/**
 * Map a raw provider userinfo response to the canonical {@link AuthUser}
 * shape.  Each provider uses slightly different field names:
 *
 * | Provider | id field       | name field              | avatar field   |
 * |----------|----------------|-------------------------|----------------|
 * | google   | `id` or `sub`  | `name`                  | `picture`      |
 * | github   | `id`           | `name` or `login`       | `avatar_url`   |
 * | discord  | `id`           | `global_name`/`username`| CDN avatar URL |
 *
 * Unknown providers fall back to a best-effort mapping using common field
 * names (`id`, `sub`, `name`, `username`, `email`, `avatar`, `picture`,
 * `avatar_url`).  All values are coerced to strings; missing fields become
 * empty strings.
 */
function normaliseProfile(provider: string, profile: Record<string, unknown>): AuthUser {
  switch (provider) {
    case 'google':
      return {
        provider,
        id: String(profile.id ?? profile.sub ?? ''),
        name: String(profile.name ?? ''),
        email: String(profile.email ?? ''),
        avatar: String(profile.picture ?? ''),
      }
    case 'github':
      return {
        provider,
        id: String(profile.id ?? ''),
        name: String(profile.name ?? profile.login ?? ''),
        email: String(profile.email ?? ''),
        avatar: String(profile.avatar_url ?? ''),
      }
    case 'discord':
      return {
        provider,
        id: String(profile.id ?? ''),
        name: String(profile.global_name ?? profile.username ?? ''),
        email: String(profile.email ?? ''),
        avatar: profile.avatar && profile.id
          ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
          : '',
      }
    default:
      return {
        provider,
        id: String(profile.id ?? profile.sub ?? ''),
        name: String(profile.name ?? (profile.username as string | undefined) ?? ''),
        email: String(profile.email ?? ''),
        avatar: String(
          profile.avatar ?? profile.picture ?? profile.avatar_url ?? '',
        ),
      }
  }
}

// ─── Public handlers ──────────────────────────────────────────────────────────

/**
 * GET /api/auth/:provider
 *
 * Generates a PKCE code verifier + state, stores them in a short-lived session
 * cookie, and redirects the browser to the provider's authorization URL.
 */
export async function handleOAuthInitiate(
  req: IncomingMessage,
  res: ServerResponse,
  provider: string,
  config: ResolvedAuthConfig,
): Promise<void> {
  const providerConfig = config.providers?.[provider]
  if (!providerConfig) {
    res.statusCode = 404
    res.end(`[cer-app] Unknown OAuth provider: ${provider}`)
    return
  }

  const endpoints = OAUTH_PROVIDERS[provider]
  const authUrl = providerConfig.authorizationUrl ?? endpoints?.authorizationUrl
  if (!authUrl) {
    res.statusCode = 500
    res.end(`[cer-app] OAuth provider "${provider}" is missing authorizationUrl`)
    return
  }

  const state = generateState()
  const verifier = await generateCodeVerifier()

  // Store state + verifier in a short-lived PKCE session (10 minutes).
  const pkceSession = useSession<PkceSessionData>({ name: '_oauth_pkce', maxAge: 600 })
  await pkceSession.set({ state, verifier, provider })

  const usePkce = providerConfig.authorizationUrl ? true : (endpoints?.pkce ?? true)
  const scopes = providerConfig.scope ?? endpoints?.defaultScopes ?? []

  const params = new URLSearchParams({
    client_id: providerConfig.clientId,
    redirect_uri: getCallbackUrl(req, provider),
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  })

  if (usePkce) {
    params.set('code_challenge', await generateCodeChallenge(verifier))
    params.set('code_challenge_method', 'S256')
  }

  res.statusCode = 302
  res.setHeader('Location', `${authUrl}?${params.toString()}`)
  res.end()
}

/**
 * GET /api/auth/callback/:provider
 *
 * Validates the state param, exchanges the authorisation code for tokens,
 * fetches the user profile, normalises it, and stores the result in the
 * auth session cookie before redirecting to `redirectAfterLogin`.
 */
export async function handleOAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
  provider: string,
  config: ResolvedAuthConfig,
): Promise<void> {
  const code = getQueryParam(req, 'code')
  const state = getQueryParam(req, 'state')

  if (!code || !state) {
    res.statusCode = 400
    res.end('[cer-app] OAuth callback missing code or state parameter')
    return
  }

  // Validate state to prevent CSRF.
  const pkceSession = useSession<PkceSessionData>({ name: '_oauth_pkce', maxAge: 600 })
  const pkceData = await pkceSession.get()

  if (!pkceData || pkceData.state !== state || pkceData.provider !== provider) {
    res.statusCode = 400
    res.end('[cer-app] OAuth state mismatch — possible CSRF attempt')
    return
  }
  await pkceSession.clear()

  const providerConfig = config.providers?.[provider]
  if (!providerConfig) {
    res.statusCode = 404
    res.end(`[cer-app] Unknown OAuth provider: ${provider}`)
    return
  }

  const endpoints = OAUTH_PROVIDERS[provider]
  const tokenUrl = providerConfig.tokenUrl ?? endpoints?.tokenUrl
  const userInfoUrl = providerConfig.userInfoUrl ?? endpoints?.userInfoUrl

  if (!tokenUrl || !userInfoUrl) {
    res.statusCode = 500
    res.end(`[cer-app] OAuth provider "${provider}" is missing tokenUrl or userInfoUrl`)
    return
  }

  // Exchange authorisation code for tokens.
  const usePkce = providerConfig.authorizationUrl ? true : (endpoints?.pkce ?? true)
  const tokenBody: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: providerConfig.clientId,
    client_secret: providerConfig.clientSecret,
    code,
    redirect_uri: getCallbackUrl(req, provider),
  }
  if (usePkce) {
    tokenBody.code_verifier = pkceData.verifier
  }

  let tokenRes: Response
  try {
    tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams(tokenBody).toString(),
    })
  } catch {
    res.statusCode = 502
    res.end('[cer-app] OAuth token exchange request failed')
    return
  }

  if (!tokenRes.ok) {
    res.statusCode = 502
    res.end('[cer-app] OAuth token exchange returned non-OK status')
    return
  }

  let tokens: { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string }
  try {
    tokens = await tokenRes.json() as typeof tokens
  } catch {
    res.statusCode = 502
    res.end('[cer-app] OAuth token exchange returned invalid JSON')
    return
  }

  // Fetch the user's profile from the provider.
  let userRes: Response
  try {
    userRes = await fetch(userInfoUrl, {
      headers: {
        'Authorization': `${tokens.token_type ?? 'Bearer'} ${tokens.access_token}`,
        'Accept': 'application/json',
      },
    })
  } catch {
    res.statusCode = 502
    res.end('[cer-app] OAuth user-info request failed')
    return
  }

  if (!userRes.ok) {
    res.statusCode = 502
    res.end('[cer-app] OAuth user-info returned non-OK status')
    return
  }

  let profile: Record<string, unknown>
  try {
    profile = await userRes.json() as Record<string, unknown>
  } catch {
    res.statusCode = 502
    res.end('[cer-app] OAuth user-info returned invalid JSON')
    return
  }
  const user: AuthUser = normaliseProfile(provider, profile)

  // Store the normalised user in the auth session cookie.
  const authSession = useSession<AuthUser>({ name: config.sessionKey })
  await authSession.set(user)

  res.statusCode = 302
  res.setHeader('Location', config.redirectAfterLogin)
  res.end()
}

/**
 * GET /api/auth/logout
 *
 * Clears the auth session cookie and redirects to `redirectAfterLogout`.
 */
export async function handleOAuthLogout(
  _req: IncomingMessage,
  res: ServerResponse,
  config: ResolvedAuthConfig,
): Promise<void> {
  const authSession = useSession({ name: config.sessionKey })
  await authSession.clear()

  res.statusCode = 302
  res.setHeader('Location', config.redirectAfterLogout)
  res.end()
}
