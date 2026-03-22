# Composables

Composables are reusable reactive logic functions. Files in `app/composables/` are automatically re-exported as a barrel — you can import from `virtual:cer-composables` anywhere in your app.

---

## Creating a composable

```ts
// app/composables/useTheme.ts
import { ref, computed } from '@jasonshimmy/custom-elements-runtime'

export function useTheme() {
  const theme = ref<'light' | 'dark'>('light')

  const isDark = computed(() => theme.value === 'dark')

  function toggle() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme.value)
  }

  return { theme, isDark, toggle }
}
```

---

## Using a composable in a page

When `autoImports.composables` is `true` (the default), composables are **automatically imported** in page, layout, and component files — you don't need to write the import statement at all:

```ts
// app/pages/index.ts
// No import needed — useTheme is auto-imported from virtual:cer-composables
component('page-index', () => {
  const { isDark, toggle } = useTheme()

  return html`
    <button @click="${toggle}">
      Switch to ${isDark.value ? 'light' : 'dark'} mode
    </button>
  `
})
```

If you need to import explicitly (e.g. in a file outside `app/pages/`, `app/layouts/`, or `app/components/`), import from `virtual:cer-composables`:

```ts
import { useTheme } from 'virtual:cer-composables'
```

---

## Virtual module

`virtual:cer-composables` is a generated barrel that re-exports everything from all files in `app/composables/`:

```ts
// virtual:cer-composables (auto-generated)
export * from "/project/app/composables/useTheme.ts"
export * from "/project/app/composables/useAuth.ts"
```

If `app/composables/` does not exist or is empty, the module exports nothing (no error).

---

## File naming

Any `.ts` file in `app/composables/` (including subdirectories) is included. No naming convention is enforced, but `use` prefix is conventional:

```
app/composables/
  useTheme.ts
  useAuth.ts
  data/
    usePosts.ts
```

---

## Side-effect safety

Composables must be side-effect-free at import time. The barrel module is imported during app initialization, before components render. Any code that runs immediately at module scope will execute at that point.

**Safe:**

```ts
// app/composables/useCounter.ts
export function useCounter() {
  const count = ref(0)
  return { count }
}
```

**Avoid:**

```ts
// app/composables/useSession.ts
// ⚠️ This runs at import time, before the DOM is ready
const session = await fetchSession()
export function useSession() { return session }
```

Use `useOnConnected` or lazy initialization inside the function body for side effects.

---

## Built-in framework composables

These composables are provided by the framework and auto-imported alongside the runtime. They do **not** live in `app/composables/` — they are injected from `@jasonshimmy/vite-plugin-cer-app/composables`.

### Auto-import scope

Built-in composables are auto-imported in the following directories:

| Directory | Auto-imported |
|---|---|
| `app/pages/` | ✅ |
| `app/layouts/` | ✅ |
| `app/components/` | ✅ |
| `app/middleware/` | ✅ |
| `server/middleware/` | ✅ |
| `server/api/` | ❌ — import explicitly |

Files in `server/api/` are not in the auto-import scope. To use composables there, import them explicitly:

```ts
import { useSession, useCookie } from '@jasonshimmy/vite-plugin-cer-app/composables'
```

See [server-api.md](./server-api.md) for details and usage examples.

### `useHead(input)`

Sets document head tags (`<title>`, `<meta>`, `<link>`, etc.). Works in SPA, SSR, and SSG modes. See [head-management.md](./head-management.md).

### `usePageData<T>()`

Returns the serialized loader data for the current page, hydrated from `window.__CER_DATA__` on the client or from the per-request `AsyncLocalStorage` context during SSR/SSG. See [data-loading.md](./data-loading.md).

### `useInject<T>(key, defaultValue?)`

Reads a value provided by a plugin via `app.provide(key, value)`. Works consistently in all rendering modes:

- **SPA / client** — resolves via `inject()` from the component context tree.
- **SSR / SSG** — reads from `globalThis.__cerPluginProvides`, populated by the server entry before the first render.

```ts
// app/pages/dashboard.ts
component('page-dashboard', () => {
  const store = useInject<Store>('store')
  return html`<p>Count: ${store?.state.count ?? 0}</p>`
})
```

If you need it outside auto-imported directories, import explicitly:

```ts
import { useInject } from '@jasonshimmy/vite-plugin-cer-app/composables'
```

> **Note:** Prefer `useInject` over the raw `inject()` primitive whenever reading plugin-provided values. Raw `inject()` works in SPA mode but returns `undefined` in SSR and SSG because the server renders components without `<cer-layout-view>`'s provide context.

### `useRuntimeConfig()`

Returns the runtime configuration set in `cer.config.ts`. Returns `{ public, private? }`:
- `public` — available everywhere (server and client)
- `private` — server-only secrets resolved from `process.env` at startup; `undefined` on the client

```ts
// cer.config.ts
export default defineConfig({
  runtimeConfig: {
    public: {
      apiBase: process.env.VITE_API_BASE ?? '/api',
    },
    private: {
      dbUrl: '',       // resolved from process.env.DB_URL at server startup
    },
  },
})
```

```ts
// app/pages/index.ts — public config, works on client and server
component('page-index', () => {
  const { public: cfg } = useRuntimeConfig()
  return html`<p>API base: ${cfg.apiBase}</p>`
})
```

```ts
// app/pages/data.ts — private config, server-only (loader)
export const loader = async () => {
  const { private: priv } = useRuntimeConfig()
  const rows = await db.query(priv!.dbUrl)
  return { rows }
}
```

**Only use `runtimeConfig.public` for values safe to expose to the browser.** Use `runtimeConfig.private` for secrets — they are never sent to the client.

Keys declared in `runtimeConfig.private` with an empty-string default are treated as **required** secrets. If the corresponding environment variable is not set at server startup, a warning is logged:

```
[cer-app] runtimeConfig.private: "dbUrl" is an empty string — set DB_URL in the environment to provide a value.
```

If the default is a non-empty string it is used as a genuine fallback — no warning is emitted.

If you need it outside auto-imported directories:

```ts
import { useRuntimeConfig } from '@jasonshimmy/vite-plugin-cer-app/composables'
```

---

### `useSeoMeta(input)`

Thin wrapper over `useHead()` for the most common SEO tags — Open Graph, Twitter Card, meta description, and canonical URL. Works in SPA, SSR, and SSG modes.

```ts
// app/pages/about.ts
component('page-about', () => {
  useSeoMeta({
    title: 'About Us',
    description: 'Learn more about our team.',
    ogTitle: 'About Us — My Site',
    ogDescription: 'Learn more about our team.',
    ogImage: 'https://example.com/og/about.png',
    ogUrl: 'https://example.com/about',
    ogType: 'website',
    ogSiteName: 'My Site',
    twitterCard: 'summary_large_image',
    twitterSite: '@mysite',
    canonical: 'https://example.com/about',
  })
  return html`<h1>About Us</h1>`
})
```

Only properties you set are emitted — passing `undefined` (or omitting a property entirely) skips that tag.

#### `SeoMetaInput` fields

| Field | Tag emitted |
|---|---|
| `title` | `<title>` |
| `description` | `<meta name="description">` |
| `ogTitle` | `<meta property="og:title">` |
| `ogDescription` | `<meta property="og:description">` |
| `ogImage` | `<meta property="og:image">` |
| `ogUrl` | `<meta property="og:url">` |
| `ogType` | `<meta property="og:type">` |
| `ogSiteName` | `<meta property="og:site_name">` |
| `twitterCard` | `<meta name="twitter:card">` |
| `twitterTitle` | `<meta name="twitter:title">` |
| `twitterDescription` | `<meta name="twitter:description">` |
| `twitterImage` | `<meta name="twitter:image">` |
| `twitterSite` | `<meta name="twitter:site">` |
| `canonical` | `<link rel="canonical">` |

If you need it outside auto-imported directories:

```ts
import { useSeoMeta } from '@jasonshimmy/vite-plugin-cer-app/composables'
```

TypeScript types:

```ts
import type { SeoMetaInput } from '@jasonshimmy/vite-plugin-cer-app/types'
```

---

### `useCookie(name, options?)`

Isomorphic cookie composable. Reads and writes cookies transparently on both server and client:

- **Server (SSR/SSG):** reads `req.headers.cookie`; writes `Set-Cookie` response headers via `res.setHeader`.
- **Client:** reads and writes `document.cookie`.

```ts
// app/pages/profile.ts
component('page-profile', () => {
  const session = useCookie('session')

  // Read
  console.log(session.value)   // 'abc123' | undefined

  // Write
  session.set('abc123', { httpOnly: true, sameSite: 'Strict' })

  // Remove
  session.remove()

  return html`<p>Session: ${session.value ?? 'none'}</p>`
})
```

#### `CookieRef`

| Member | Type | Description |
|---|---|---|
| `value` | `string \| undefined` | Current cookie value (read at call time) |
| `set(value, options?)` | `void` | Write the cookie |
| `remove(options?)` | `void` | Delete the cookie (sets `Max-Age=0`) |

#### `CookieOptions`

| Option | Type | Description |
|---|---|---|
| `path` | `string` | Cookie path (defaults to `/` when setting/removing) |
| `domain` | `string` | Cookie domain |
| `maxAge` | `number` | Max age in seconds |
| `expires` | `Date` | Expiry date |
| `httpOnly` | `boolean` | Set `HttpOnly` flag |
| `secure` | `boolean` | Set `Secure` flag |
| `sameSite` | `'Strict' \| 'Lax' \| 'None'` | `SameSite` attribute |

Default options can be passed as the second argument to `useCookie` — they are merged with options passed to `set()`/`remove()`:

```ts
const auth = useCookie('auth', { httpOnly: true, secure: true, sameSite: 'Strict' })
auth.set('tok')   // inherits httpOnly, secure, sameSite automatically
```

If you need it outside auto-imported directories:

```ts
import { useCookie } from '@jasonshimmy/vite-plugin-cer-app/composables'
```

TypeScript types:

```ts
import type { CookieOptions, CookieRef } from '@jasonshimmy/vite-plugin-cer-app/types'
```

---

### `defineMiddleware(fn)`

Identity helper that gives TypeScript the correct `MiddlewareFn` type. Auto-imported — no import needed in `app/middleware/` files.

```ts
// app/middleware/auth.ts
export default defineMiddleware(async (to, from) => {
  const isLoggedIn = !!localStorage.getItem('token')
  return isLoggedIn ? true : '/login'
})
```

---

### `defineServerMiddleware(fn)`

Identity helper for server-side middleware. Files in `server/middleware/` export a default `defineServerMiddleware()` function. They run in **alphabetical filename order** on every SSR and API request, before routing — in all environments (dev server, Vercel, Netlify, Cloudflare).

```ts
// server/middleware/01-cors.ts
export default defineServerMiddleware((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  next()
})

// server/middleware/02-auth.ts
export default defineServerMiddleware(async (req, res, next) => {
  const session = useSession<{ userId: string }>()
  const data = await session.get()
  if (!data?.userId) { res.statusCode = 401; res.end('Unauthorized'); return }
  ;(req as any).user = data
  next()
})
```

Call `next()` to continue to the next middleware or request handler. Write the response without calling `next()` to short-circuit the chain. Calling `next(err)` with an error sends a `500` response.

If you need it outside auto-imported directories:

```ts
import { defineServerMiddleware } from '@jasonshimmy/vite-plugin-cer-app/composables'
```

---

### `useSession<T>(options?)`

HMAC-SHA-256 signed cookie session. Stores JSON-serialisable session data in a single `httpOnly` cookie, signed with a secret key. Works isomorphically: on the server it reads/writes HTTP headers; on the client it reads the cookie from `document.cookie`.

**Setup:** declare the signing key in `runtimeConfig.private`:

```ts
// cer.config.ts
export default defineConfig({
  runtimeConfig: {
    private: { sessionSecret: '' },  // resolved from SESSION_SECRET env var at startup
  },
})
```

**Usage:**

```ts
// server/middleware/auth.ts — validate session on every request
export default defineServerMiddleware(async (req, res, next) => {
  const session = useSession<{ userId: string; role: string }>()
  const data = await session.get()
  if (!data?.userId) { res.statusCode = 401; res.end(); return }
  next()
})

// app/pages/login.ts — create session after verifying credentials
export const loader = async ({ req }) => {
  // ... verify credentials
  const session = useSession<{ userId: string }>()
  await session.set({ userId: user.id })
  return { ok: true }
}

// app/pages/logout.ts
export const loader = async () => {
  await useSession().clear()
  return { ok: true }
}
```

| Method | Returns | Description |
|---|---|---|
| `get()` | `Promise<T \| null>` | Reads and verifies the session cookie. Returns data or `null` if absent/invalid/tampered. |
| `set(data)` | `Promise<void>` | Signs `data` and writes the session cookie. Replaces any existing session. |
| `clear()` | `Promise<void>` | Clears the session cookie by setting `maxAge = 0`. |

#### `SessionOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `'session'` | Cookie name |
| `maxAge` | `number` | `604800` (7 days) | Cookie max-age in seconds |

If you need it outside auto-imported directories:

```ts
import { useSession } from '@jasonshimmy/vite-plugin-cer-app/composables'
import type { SessionOptions, SessionComposable } from '@jasonshimmy/vite-plugin-cer-app/composables'
```


See [Middleware](./middleware.md) for full documentation.
