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

If you need it outside auto-imported directories:

```ts
import { useRuntimeConfig } from '@jasonshimmy/vite-plugin-cer-app/composables'
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

See [Middleware](./middleware.md) for full documentation.
