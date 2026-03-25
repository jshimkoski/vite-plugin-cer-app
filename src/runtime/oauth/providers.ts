/**
 * Built-in OAuth provider endpoint definitions.
 * Users may override any of these by setting `authorizationUrl`, `tokenUrl`,
 * or `userInfoUrl` directly on the `OAuthProviderConfig`.
 */

export interface OAuthEndpoints {
  authorizationUrl: string
  tokenUrl: string
  userInfoUrl: string
  defaultScopes: string[]
  /** Some providers (e.g. GitHub) do not support PKCE. */
  pkce: boolean
}

export const OAUTH_PROVIDERS: Record<string, OAuthEndpoints> = {
  google: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    defaultScopes: ['openid', 'email', 'profile'],
    pkce: true,
  },
  github: {
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    defaultScopes: ['read:user', 'user:email'],
    pkce: false, // GitHub does not support PKCE
  },
  discord: {
    authorizationUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userInfoUrl: 'https://discord.com/api/users/@me',
    defaultScopes: ['identify', 'email'],
    pkce: true,
  },
}
