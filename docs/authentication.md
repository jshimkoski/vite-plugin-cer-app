# Authentication

The framework includes a built-in OAuth 2.0 authentication system. Enabling it auto-generates three API routes and provides `useAuth()` for reading the current user anywhere in your app.

---

## Setup

Install the providers you need in `cer.config.ts`:

```ts
// cer.config.ts
import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  auth: {
    providers: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
    redirectAfterLogin: '/dashboard',
    redirectAfterLogout: '/',
    sessionKey: 'auth',  // optional — defaults to 'auth'
  },
})
```

Configure the OAuth callback URL in your provider's developer console:

```
https://yourdomain.com/api/auth/callback/github
https://yourdomain.com/api/auth/callback/google
```

---

## Generated routes

When `auth` is configured, the framework automatically registers:

| Route | Description |
|---|---|
| `GET /api/auth/:provider` | Initiates the OAuth flow — redirects the browser to the provider's authorization page |
| `GET /api/auth/callback/:provider` | Handles the OAuth callback — exchanges the code for tokens, fetches the user profile, writes the auth session cookie, and redirects to `redirectAfterLogin` |
| `GET /api/auth/logout` | Clears the auth session cookie and redirects to `redirectAfterLogout` |

---

## `useAuth(sessionKey?)`

`useAuth()` reads the authenticated user and provides helpers for login and logout. The optional `sessionKey` parameter specifies which session cookie to read (defaults to the value of `auth.sessionKey` in `cer.config.ts`, which itself defaults to `'auth'`). It works isomorphically:

- **Server (SSR/SSG)** — reads the auth session from the per-request `AsyncLocalStorage` context (populated by the entry-server handler before rendering).
- **Client** — reads from `globalThis.__CER_AUTH_USER__` (injected into the HTML by the server and captured by the client entry before the app boots).

```ts
// app/pages/profile.ts
component('page-profile', () => {
  const { user, loggedIn, login, logout } = useAuth()

  return html`
    ${loggedIn
      ? html`
          <p>Hello, ${user?.name}</p>
          <img src="${user?.avatar}" alt="avatar" />
          <button @click="${logout}">Log out</button>
        `
      : html`
          <button @click="${() => login('github')}">Log in with GitHub</button>
          <button @click="${() => login('google')}">Log in with Google</button>
        `
    }
  `
})
```

### `AuthComposable`

| Member | Type | Description |
|---|---|---|
| `user` | `AuthUser \| null` | The authenticated user, or `null` if not logged in |
| `loggedIn` | `boolean` | `true` when a user is authenticated |
| `login(provider)` | `void` | Redirects to `/api/auth/:provider` to start the OAuth flow (client only) |
| `logout()` | `void` (client) / `Promise<void>` (server) | Client: assigns `window.location.href` to `/api/auth/logout` (synchronous, no promise). Server: clears the auth session cookie directly and returns a promise. |

### `AuthUser`

| Field | Type | Description |
|---|---|---|
| `provider` | `string` | OAuth provider name, e.g. `'github'`, `'google'`, `'discord'` |
| `id` | `string` | Provider-issued user ID |
| `name` | `string?` | Display name |
| `email` | `string?` | Email address |
| `avatar` | `string?` | Profile picture URL |
| `[key: string]` | `unknown` | Any additional fields from `mapUser` or the default normalisation |

---

## Protecting routes with middleware

Use `useAuth()` inside a middleware to guard protected pages:

```ts
// app/middleware/require-auth.ts
export default defineMiddleware(() => {
  const { loggedIn } = useAuth()
  if (!loggedIn) return '/login'
})
```

Attach it to a page via `meta.middleware`:

```ts
// app/pages/dashboard.ts
component('page-dashboard', () => {
  const { user } = useAuth()
  return html`<h1>Welcome, ${user?.name}</h1>`
})

export const meta = { middleware: ['require-auth'] }
```

---

## Built-in providers

Three providers are pre-configured. Supply only `clientId` and `clientSecret`:

| Provider | Scopes | PKCE |
|---|---|---|
| `google` | `openid email profile` | ✅ S256 |
| `github` | `read:user user:email` | ❌ not supported |
| `discord` | `identify email` | ✅ S256 |

Override scopes per provider:

```ts
github: {
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  scope: ['read:user', 'repo'],  // add repo access
},
```

---

## Custom providers

Supply all three endpoint URLs for providers not built in:

```ts
export default defineConfig({
  auth: {
    providers: {
      myProvider: {
        clientId: process.env.MY_CLIENT_ID!,
        clientSecret: process.env.MY_CLIENT_SECRET!,
        authorizationUrl: 'https://auth.example.com/oauth/authorize',
        tokenUrl: 'https://auth.example.com/oauth/token',
        userInfoUrl: 'https://auth.example.com/oauth/userinfo',
        scope: ['profile', 'email'],
      },
    },
  },
})
```

---

## Customising the user shape

By default the framework normalises the provider's profile to `{ provider, id, name, email, avatar }`. Use `mapUser` to store additional or differently-shaped data in the session:

```ts
github: {
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  mapUser: (profile, tokens) => ({
    provider: 'github',
    id: String(profile.id),
    name: String(profile.name ?? profile.login),
    email: String(profile.email ?? ''),
    avatar: String(profile.avatar_url ?? ''),
    login: String(profile.login),  // extra field
    accessToken: tokens.accessToken,
  }),
},
```

The object returned by `mapUser` becomes `useAuth().user` on both server and client.

---

## `auth.sessionKey`

The auth session is stored in a signed `httpOnly` cookie. `sessionKey` sets the cookie name (default `'auth'`). It must not collide with other `useSession()` names in your app.

Reading the session key explicitly is only needed if you call `useSession` manually for auth data:

```ts
const session = useSession({ name: 'auth' })
const user = await session.get<AuthUser>()
```

`useAuth()` reads this automatically — prefer `useAuth()` over reading the session directly.

---

## Security

- **PKCE (S256)** is used for all providers that support it (Google, Discord). The code verifier is stored in a short-lived `_oauth_pkce` session cookie (10-minute TTL) and cleared after the callback.
- **State parameter** — a 16-byte random value is generated per flow and verified in the callback, preventing CSRF.
- **Client secrets** never appear in the client bundle. The auth handler is only imported by the server-side virtual module.

---

## TypeScript

```ts
import { useAuth } from '@jasonshimmy/vite-plugin-cer-app/composables'
import type { AuthUser, AuthComposable } from '@jasonshimmy/vite-plugin-cer-app/composables'
import type { AuthConfig, OAuthProviderConfig } from '@jasonshimmy/vite-plugin-cer-app/types'
```

`useAuth` is auto-imported in `app/pages/`, `app/layouts/`, `app/components/`, `app/middleware/`, and `app/composables/`. No import statement is needed in those directories.
