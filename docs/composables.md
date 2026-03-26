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
| `app/composables/` | ✅ |
| `server/middleware/` | ✅ |
| `server/api/` | ❌ — import explicitly |

Files in `server/api/` are not in the auto-import scope. To use composables there, import them explicitly:

```ts
import { useSession, useCookie } from '@jasonshimmy/vite-plugin-cer-app/composables'
```

See [server-api.md](./server-api.md) for details and usage examples.

### `useFetch<T>(url, options?)`

Isomorphic data-fetching composable:

- **Inside a `component()` render function** — returns reactive `data`, `pending`, and `error` refs that re-render the component automatically when the request settles.
- **Inside a `loader` or other async context** — returns a thenable result you can `await` to block SSR rendering until data is ready.

```ts
component('page-posts', () => {
  const { data: posts, pending, error } = useFetch<Post[]>('/api/posts')

  return html`
    ${pending.value ? html`<p>Loading…</p>` : ''}
    ${error.value ? html`<p>Error: ${error.value.message}</p>` : ''}
    <ul>${posts.value?.map(p => html`<li>${p.title}</li>`)}</ul>
  `
})
```

See [use-fetch.md](./use-fetch.md) for full documentation including options, lazy fetching, POST requests, and TypeScript types.

---

### `useAuth(sessionKey?)`

Returns the authenticated user and helpers for login/logout. Works isomorphically — on the server it reads the auth session from the per-request context; on the client it reads from the value injected into the HTML at render time.

```ts
component('page-nav', () => {
  const { user, loggedIn, login, logout } = useAuth()

  return html`
    ${loggedIn
      ? html`<span>${user?.name}</span><button @click="${logout}">Log out</button>`
      : html`<button @click="${() => login('github')}">Log in</button>`
    }
  `
})
```

Requires `auth` configuration in `cer.config.ts`. See [authentication.md](./authentication.md) for setup, OAuth providers, middleware guards, and TypeScript types.

---

### `useHead(input)`

Sets document head tags (`<title>`, `<meta>`, `<link>`, etc.). Works in SPA, SSR, and SSG modes. See [head-management.md](./head-management.md).

### `usePageData<T>()`

Returns the serialized loader data for the current page, hydrated from `window.__CER_DATA__` on the client or from the per-request `AsyncLocalStorage` context during SSR/SSG. See [data-loading.md](./data-loading.md).

### `useInject<T>(key, defaultValue?): T | undefined`

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
  const rows = await db.query(priv?.dbUrl)
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
  const { loggedIn } = useAuth()
  return loggedIn ? true : '/login'
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

---

### `useRoute()`

Returns the current route's `path`, `params`, `query`, and `meta` — works isomorphically in all rendering modes.

- **Server (SSR/SSG)** — reads from the per-request `AsyncLocalStorage` context populated before the page renders.
- **Client** — reads from the router instance exposed by the framework.

```ts
// app/layouts/default.ts — display page title from route meta
component('layout-default', () => {
  const route = useRoute()

  return html`
    <header>
      <h1>${route.meta?.title ?? 'My App'}</h1>
    </header>
    <main><slot></slot></main>
  `
})
```

```ts
// app/pages/post.ts — use dynamic route params
component('page-post', () => {
  const { params } = useRoute()
  const { data: post } = useFetch(`/api/posts/${params.id}`)
  return html`<h1>${post.value?.title}</h1>`
})
```

#### `RouteInfo`

| Field | Type | Description |
|---|---|---|
| `path` | `string` | Current URL path, e.g. `'/posts/42'` |
| `params` | `Record<string, string>` | Dynamic route params, e.g. `{ id: '42' }` |
| `query` | `Record<string, string>` | Parsed query string, e.g. `{ page: '2' }` |
| `meta` | `Record<string, unknown> \| null` | The raw `meta` object exported by the matched page file. Custom fields like `title`, `render`, `hydrate`, etc., are accessible here. |

If you need it outside auto-imported directories:

```ts
import { useRoute } from '@jasonshimmy/vite-plugin-cer-app/composables'
import type { RouteInfo } from '@jasonshimmy/vite-plugin-cer-app/composables'
```

---

### `useState<T>(key, init?)`

Globally-keyed reactive state shared across layouts, pages, and components. Any two components that call `useState` with the same key get the **same reactive ref** — mutating `.value` in one component automatically re-renders all components that read it.

Works isomorphically:
- **SSR/SSG** — state is scoped per-request via `AsyncLocalStorage`. Set initial values inside a page `loader` (which runs before rendering) so the layout can read them synchronously during the server render pass. After rendering, all state values are serialized into `window.__CER_STATE_INIT__` and hydrated on the client.
- **Client** — state lives in a singleton `Map` on `globalThis`. On first use, the Map is pre-populated from `window.__CER_STATE_INIT__` (the SSR snapshot) so there is no flash to default values after hydration. Mutations propagate reactively to all components sharing the key.

**Key contract:** the `init` value (or factory) is only evaluated when the key does not yet exist. Subsequent calls with the same key return the existing ref; `init` is ignored.

> **SSR → client:** State set in a page `loader` is serialized from server to client via `window.__CER_STATE_INIT__`. On first `useState()` call, the client Map is pre-populated from this snapshot — the layout renders with the correct value immediately after hydration, with no flash to default values.
>
> State set in a component render function IS included in the snapshot (render functions execute during SSR before state is serialized), but the layout's initial HTML will still show its fallback value — the layout has already rendered its HTML by the time the page component executes. The reactive system updates the layout after client hydration.
>
> State set in `useOnConnected` is **not** in the snapshot — `useOnConnected` never fires during SSR since there is no DOM. **Always set page-specific state in the `loader`** — it runs before rendering begins, so both the initial SSR HTML and the hydration snapshot contain the correct value.

#### Page-to-layout communication

The primary use case is passing reactive metadata (title, breadcrumbs, etc.) from a page to its layout:

```ts
// app/pages/about.ts
// Set in the loader so it's available during SSR rendering (layout renders before page)
export const loader = async () => {
  useState<string>('pageTitle').value = 'About Us'
  return {}
}

component('page-about', () => {
  const title = useState<string>('pageTitle')
  return html`<h1>${title.value}</h1>`
})
```

```ts
// app/layouts/default.ts
component('layout-default', () => {
  // 'My App' is the fallback shown before any page sets a title
  const pageTitle = useState('pageTitle', 'My App')

  return html`
    <header><h1>${pageTitle.value}</h1></header>
    <slot></slot>
  `
})
```

On **SSR/SSG**: the loader runs first → sets the state → layout reads it synchronously → initial HTML already contains the correct title.
On **client**: the page sets the state → the layout's reactive dependency fires → layout re-renders.

#### Shared counter across components

```ts
// app/composables/useSharedCount.ts
export function useSharedCount() {
  const count = useState('sharedCount', 0)
  const increment = () => { count.value++ }
  return { count, increment }
}
```

```ts
// app/components/counter-a.ts
component('counter-a', () => {
  const { count, increment } = useSharedCount()
  return html`<button @click="${increment}">Count: ${count.value}</button>`
})

// app/components/counter-b.ts — same key, same ref, same value
component('counter-b', () => {
  const { count } = useSharedCount()
  return html`<p>Count seen by B: ${count.value}</p>`
})
```

Clicking the button in `counter-a` updates `counter-b` automatically.

#### SSR rendering order

On SSR, layouts render **before** pages (outer-to-inner vnode tree). If state is set inside a page's `component()` render function it will be too late for the layout to read it during SSR. **Always set page-specific state in the `loader`** so it is written before rendering begins.

#### Hard refresh behavior

`useState` is **in-memory only**. A hard browser refresh wipes `globalThis.__CER_STATE__` and starts fresh — exactly like the first page load. Whether values are available immediately after a refresh depends on where they are set:

| Where value is set | Available to layout on SSR? | Available after hard refresh? |
|---|---|---|
| Page `loader` | ✅ | ✅ (loader re-runs) |
| `init` param of `useState` | ✅ (fallback default) | ✅ (init re-evaluated) |
| Component render function | ❌ (layout renders first) | ✅ (brief flash, then reactive update) |
| `useOnConnected` | ❌ (never fires during SSR) | ✅ (brief flash, then reactive update) |

**Values are not persisted across hard refreshes.** If a user changes a theme from `'light'` to `'dark'` and then hard-refreshes, they get `'light'` (the init) again.

To persist state across refreshes, seed the init from a persistent store using the **factory form** — it is only evaluated once per session (when the key does not yet exist in the Map):

```ts
export function useTheme() {
  const theme = useState<string>('theme', () =>
    (typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null) ?? 'light'
  )

  function setTheme(value: string) {
    theme.value = value
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('theme', value)
    }
  }

  return { theme, setTheme }
}
```

#### TypeScript

```ts
const pageTitle = useState<string>('pageTitle', 'My App')
// pageTitle.value is typed as string
```

If you need it outside auto-imported directories:

```ts
import { useState } from '@jasonshimmy/vite-plugin-cer-app/composables'
```

---

### `navigateTo(path): Promise<void>`

Programmatic navigation — works isomorphically:

- **Server context** (inside a loader or middleware): sends a `302` redirect immediately via the request's response object.
- **Client context**: delegates to the framework router so the full navigation pipeline (middleware, loaders, loading indicator) runs normally.

```ts
// app/middleware/require-auth.ts
export default defineMiddleware(() => {
  const { loggedIn } = useAuth()
  if (!loggedIn) return navigateTo('/login')
})
```

```ts
// app/pages/dashboard.ts — navigate programmatically on a button click
component('page-dashboard', () => {
  return html`
    <button @click="${() => navigateTo('/settings')}">
      Open Settings
    </button>
  `
})
```

If you need it outside auto-imported directories:

```ts
import { navigateTo } from '@jasonshimmy/vite-plugin-cer-app/composables'
```
