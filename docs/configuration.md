# Configuration

The framework is configured via `cer.config.ts` at the project root. All fields are optional — defaults are listed below.

```ts
// cer.config.ts
import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  mode: 'spa',
  srcDir: 'app',
  port: 3000,

  ssg: {
    routes: 'auto',
    concurrency: 4,
    fallback: false,
  },

  router: {
    base: '/',
  },

  jitCss: {
    content: ['./app/pages/**/*.ts', './app/components/**/*.ts', './app/layouts/**/*.ts'],
    extendedColors: false,
  },

  autoImports: {
    components: true,
    composables: true,
    directives: true,
    runtime: true,
  },
})
```

---

## Top-level options

### `mode`

**Type:** `'spa' | 'ssr' | 'ssg'`
**Default:** `'spa'`

Selects the rendering strategy for the application.

- `'spa'` — Client-side only. Standard Vite build, no server rendering.
- `'ssr'` — Server-side rendering. Dual build (client + server bundles). Requires a Node.js server.
- `'ssg'` — Static site generation. All routes rendered to HTML at build time.

See [Rendering Modes](rendering-modes.md) for full details.

---

### `srcDir`

**Type:** `string`
**Default:** `'app'`

Path to the client app source directory, relative to the project root. All `app/` paths below (`pages/`, `layouts/`, etc.) resolve under this directory.

```ts
srcDir: 'src/app'  // → pages at src/app/pages/, etc.
```

---

### `port`

**Type:** `number`
**Default:** `3000`

Dev server port. Overridden by the `--port` CLI flag.

---

## `ssg` options

Controls static site generation.

```ts
ssg: {
  routes: 'auto',
  concurrency: 4,
  fallback: false,
}
```

### `ssg.routes`

**Type:** `'auto' | string[]`
**Default:** `'auto'`

Which paths to generate at build time.

- `'auto'` — Scans `app/pages/` and generates all static routes. For dynamic routes, calls `meta.ssg.paths()` to enumerate paths.
- `string[]` — Explicit list of paths, e.g. `['/about', '/blog/hello-world']`.

### `ssg.concurrency`

**Type:** `number`
**Default:** `4`

Number of pages rendered in parallel during the SSG build.

### `ssg.fallback`

**Type:** `boolean`
**Default:** `false`

When `true`, unenumerated dynamic routes fall back to SSR at request time instead of returning 404.

---

## `router` options

Passed to the underlying `useRouter()` call.

```ts
router: {
  base: '/',
  scrollToFragment: { enabled: true, offset: 0 },
}
```

### `router.base`

**Type:** `string`
**Default:** `'/'`

Base path for all routes. Use when deploying to a sub-path, e.g. `'/my-app'`.

### `router.scrollToFragment`

**Type:** `boolean | { enabled: boolean; offset: number }`

Controls scroll-to-fragment (`#anchor`) behavior.

---

## `jitCss` options

Passed to the runtime's `cerPlugin` for JIT (just-in-time) CSS generation.

```ts
jitCss: {
  content: ['./app/pages/**/*.ts', './app/components/**/*.ts', './app/layouts/**/*.ts'],
  extendedColors: false,
}
```

### `jitCss.content`

**Type:** `string[]`
**Default:** Pages, components, and layouts directories.

Glob patterns pointing to files that use utility classes. The JIT compiler scans these files to generate CSS.

### `jitCss.extendedColors`

**Type:** `boolean`
**Default:** `false`

Enables the extended color palette in the JIT CSS system.

---

## `autoImports` options

Controls which identifiers are automatically injected at the top of files in `app/pages/`, `app/layouts/`, and `app/components/`.

```ts
autoImports: {
  components: true,   // per-page component code splitting via cerComponentImports transform
  composables: true,  // virtual:cer-composables (re-exports app/composables/)
  directives: true,   // when, each, match, anchorBlock
  runtime: true,      // component, html, ref, computed, watch, etc.
}
```

### `autoImports.components`

When `true` (default), the `cerComponentImports` Vite transform plugin is active. It scans each page, layout, and component file for custom element tags in `html\`` templates and automatically injects static `import` statements pointing to the corresponding source files in `app/components/`. This gives Rollup the module graph edges needed to code-split components per page — only the components a page actually uses are bundled into that page's chunk.

When `false`, no transform runs and no component files are auto-imported. You must import component files manually (e.g. from a plugin or explicit import at the top of each file).

When `runtime: true`, the following are injected if used and not already imported:

```ts
import { component, html, css, ref, computed, watch, watchEffect,
         useProps, useEmit, useOnConnected, useOnDisconnected,
         useOnAttributeChanged, useOnError, useStyle, useDesignTokens,
         useGlobalStyle, useExpose, useSlots, provide, inject,
         createComposable, nextTick, defineModel, getCurrentComponentContext,
         isReactiveState, unsafeHTML, decodeEntities, useTeleport
} from '@jasonshimmy/custom-elements-runtime'
```

When `directives: true`, the following are injected if used and not already imported:

```ts
import { when, each, match, anchorBlock } from '@jasonshimmy/custom-elements-runtime/directives'
```

The following framework composables are **always** auto-imported when used, regardless of the `runtime` flag — they come from the plugin package:

```ts
import {
  useHead,
  usePageData,
  useInject,
  useRuntimeConfig,
  useRoute,
  useState,
  useAuth,
  useFetch,
  useSeoMeta,
  useCookie,
  useSession,
  useLocale,
  defineMiddleware,
  defineServerMiddleware,
  navigateTo,
} from '@jasonshimmy/vite-plugin-cer-app/composables'
```

Set any flag to `false` to opt out and manage imports manually.

---

## `adapter`

**Type:** `'vercel' | 'netlify' | 'cloudflare' | ((root: string) => Promise<void>)`
**Default:** `undefined`

When set, `cer-app build` automatically runs the adapter after the build completes, producing the platform-specific deployment output alongside `dist/`.

### Built-in adapters

```ts
export default defineConfig({
  mode: 'ssr',
  adapter: 'vercel',    // or 'netlify' | 'cloudflare'
})
```

| Value | Output | Deploy command |
|---|---|---|
| `'vercel'` | `.vercel/output/` (Build Output API v3) | `vercel deploy --prebuilt` |
| `'netlify'` | `netlify/functions/ssr.mjs` + `netlify.toml` | `netlify deploy` |
| `'cloudflare'` | `dist/_worker.js` + `wrangler.toml` | `wrangler pages deploy dist` |

### Custom adapter

Pass an async function to target any platform (Railway, Fly.io, bare Node.js, Docker, etc.). `root` is the absolute path to the project root. Both `dist/client/` and `dist/server/` are already present by the time your function is called.

```ts
export default defineConfig({
  mode: 'ssr',
  adapter: async (root) => {
    // Example: copy the server bundle to a custom output location
    const { cp, mkdir } = await import('node:fs/promises')
    await mkdir(`${root}/deploy`, { recursive: true })
    await cp(`${root}/dist`, `${root}/deploy/dist`, { recursive: true })
    console.log('[my-adapter] done')
  },
})
```

### Running adapters manually

Adapters can also be run independently (without re-building) using `cer-app adapt`:

```sh
cer-app adapt --platform vercel
cer-app adapt --platform netlify
cer-app adapt --platform cloudflare
cer-app adapt --platform custom   # runs the function adapter from cer.config.ts
```

See [cli.md](./cli.md#cer-app-adapt) for full details.

---

## `i18n` options

Enables locale-aware URL routing and the `useLocale()` composable. No external package is required.

```ts
export default defineConfig({
  i18n: {
    locales: ['en', 'fr', 'de'],
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
  },
})
```

### `i18n.locales`

**Type:** `string[]`
**Required**

All supported locale codes. These must be BCP 47 language tags or short codes (e.g. `'en'`, `'fr'`, `'zh-Hant'`).

### `i18n.defaultLocale`

**Type:** `string`
**Required**

The fallback locale. Used when no locale can be detected from the URL.

### `i18n.strategy`

**Type:** `'prefix' | 'prefix_except_default' | 'no_prefix'`
**Default:** `'prefix_except_default'`

Controls how locales appear in URLs:

| Strategy | Default locale URL | Other locale URL |
|---|---|---|
| `'prefix'` | `/en/about` | `/fr/about` |
| `'prefix_except_default'` | `/about` | `/fr/about` |
| `'no_prefix'` | `/about` | `/about` (locale from cookie/header only) |

> **Recommendation:** Use `'prefix_except_default'` for most projects. It keeps your existing default-locale URLs intact while adding locale prefixes for other languages.

See [i18n.md](./i18n.md) for full documentation of routing, `useLocale()`, SSR/SSG behavior, and the locale switcher pattern.

---

## `runtimeConfig` options

Expose typed, centralized configuration to your app. Public values are available everywhere; private values are server-only secrets resolved from environment variables at startup.

```ts
export default defineConfig({
  runtimeConfig: {
    public: {
      apiBase: process.env.VITE_API_BASE ?? 'https://api.example.com',
      appVersion: '1.0.0',
    },
    private: {
      dbUrl: '',         // resolved from process.env.DB_URL at server startup
      secretKey: '',     // resolved from process.env.SECRET_KEY at server startup
    },
  },
})
```

### `runtimeConfig.public`

**Type:** `Record<string, unknown>`
**Default:** `{}`

Values placed here are serialized into `virtual:cer-app-config` at build time and accessible on both server and client via `useRuntimeConfig().public`.

> **Security:** Only put values here that are safe to expose to the browser. Do not put secrets, tokens, or private keys in `public`.

> **Serialization:** Values must be JSON-serializable (strings, numbers, booleans, plain objects, arrays). Functions, class instances, `undefined`, and circular references are not supported.

```ts
// Any page, layout, component, or composable
component('page-index', () => {
  const config = useRuntimeConfig()
  // config.public.apiBase → 'https://api.example.com'

  return html`<p>API: ${config.public.apiBase}</p>`
})
```

**TypeScript:** Import `RuntimePublicConfig` to type your public config if needed:

```ts
import type { RuntimePublicConfig } from '@jasonshimmy/vite-plugin-cer-app/types'
```

---

### `runtimeConfig.private`

**Type:** `Record<string, string>`
**Default:** `{}`

Server-only secrets. Declare keys with empty-string defaults in `cer.config.ts` for typing purposes. **Private values are never included in the client bundle.**

**Environment variable resolution order** (at server startup, for each declared key):

1. `process.env[key]` — exact case (e.g. `process.env.dbUrl`)
2. `process.env[UPPER_SNAKE_CASE(key)]` — conventional env var form (e.g. `process.env.DB_URL`)
3. The declared default value — used as a last-resort fallback

camelCase keys are automatically converted: `dbUrl` → `DB_URL`, `secretKey` → `SECRET_KEY`.

```ts
// cer.config.ts
export default defineConfig({
  runtimeConfig: {
    private: {
      dbUrl: '',       // resolved from process.env.dbUrl or process.env.DB_URL
      secretKey: '',   // resolved from process.env.secretKey or process.env.SECRET_KEY
    },
  },
})
```

```ts
// app/pages/data.ts — loader (server-only)
export const loader = async () => {
  const { private: priv } = useRuntimeConfig()
  const rows = await db.query(priv?.dbUrl)
  return { rows }
}
```

> **Browser enforcement:** Accessing `useRuntimeConfig().private` in a browser context throws a clear runtime error:
> ```
> [cer-app] runtimeConfig.private is not available in the browser.
> Move this access into a server-only loader, middleware, or API handler.
> ```
> This prevents accidental secret leaks — the Proxy is applied automatically with no extra configuration required.

**TypeScript:** Import `RuntimePrivateConfig` to type your private config:

```ts
import type { RuntimePrivateConfig } from '@jasonshimmy/vite-plugin-cer-app/types'
```

---

## Observability hooks

Three optional hooks in `cer.config.ts` give you visibility into every SSR request without modifying any application code.

> **SSR mode only.** These hooks are invoked by the Node.js SSR request handler. They do **not** fire in SSG or SPA modes:
> - **SSG** — pages are pre-rendered to static HTML at build time and served directly by the file server. No Node.js handler processes individual page requests at runtime, so no hooks fire.
> - **SPA** — there is no server-side render pass; the browser loads `index.html` and renders entirely client-side.
>
> If you need request logging in SSG/SPA deployments, add it at the reverse-proxy or CDN layer instead.

### `onRequest`

Called at the start of every SSR request, before route matching and the data loader. Use this for request logging or to initialise per-request APM transactions.

**Type:** `(ctx: RequestHookContext) => void | Promise<void>`

| Field | Type | Description |
|---|---|---|
| `ctx.path` | `string` | URL pathname (e.g. `/about`) |
| `ctx.method` | `string` | HTTP method in upper-case (e.g. `'GET'`) |
| `ctx.req` | `IncomingMessage` | Raw Node.js incoming request |

Errors thrown inside `onRequest` are silently swallowed — the hook cannot crash the request handler.

### `onResponse`

Called after every SSR response is sent, on both success and error paths. `ctx.duration` contains the elapsed milliseconds from the first byte received to `res.end()`. Use this for latency tracking and access logging.

**Type:** `(ctx: ResponseHookContext) => void | Promise<void>`

| Field | Type | Description |
|---|---|---|
| `ctx.path` | `string` | URL pathname |
| `ctx.method` | `string` | HTTP method |
| `ctx.statusCode` | `number` | Final HTTP status code written to the response |
| `ctx.duration` | `number` | Request duration in milliseconds |
| `ctx.req` | `IncomingMessage` | Raw Node.js incoming request |

Errors thrown inside `onResponse` are silently swallowed.

### `onError`

Called when an error is caught by the framework's SSR error boundaries:

- **`'loader'`** — the data loader threw
- **`'render'`** — an infrastructure-level render error escaped the runtime
- **`'middleware'`** — a server middleware threw

Use this to forward errors to Sentry, Datadog, or any error-reporting service.

**Type:** `(err: unknown, ctx: ErrorHookContext) => void | Promise<void>`

| Field | Type | Description |
|---|---|---|
| `ctx.type` | `'loader' \| 'render' \| 'middleware'` | Which layer the error originated from |
| `ctx.path` | `string` | URL pathname |
| `ctx.req` | `IncomingMessage` | Raw Node.js incoming request |

Errors thrown inside `onError` are silently swallowed — the hook cannot crash the request handler.

### Example — Sentry integration

```ts
// cer.config.ts
import * as Sentry from '@sentry/node'
import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

Sentry.init({ dsn: process.env.SENTRY_DSN })

export default defineConfig({
  onError(err, ctx) {
    Sentry.captureException(err, {
      tags: { type: ctx.type, path: ctx.path },
    })
  },

  onRequest(ctx) {
    console.log(`→ ${ctx.method} ${ctx.path}`)
  },

  onResponse(ctx) {
    console.log(`← ${ctx.statusCode} ${ctx.path} (${ctx.duration}ms)`)
  },
})
```

### Example — console request logger

```ts
// cer.config.ts
import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  onRequest({ method, path }) {
    console.log(`[${new Date().toISOString()}] ${method} ${path}`)
  },
  onResponse({ method, path, statusCode, duration }) {
    console.log(`[${new Date().toISOString()}] ${statusCode} ${method} ${path} — ${duration}ms`)
  },
})
```

### TypeScript types

All hook context types are exported from `@jasonshimmy/vite-plugin-cer-app/types`:

```ts
import type {
  ErrorHookContext,
  RequestHookContext,
  ResponseHookContext,
} from '@jasonshimmy/vite-plugin-cer-app/types'
```

---

## Passing config to the Vite plugin directly

When using `vite.config.ts` instead of (or alongside) `cer.config.ts`:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { cerApp } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  plugins: [
    cerApp({
      mode: 'ssr',
    }),
  ],
})
```

`cerApp()` accepts the same `CerAppConfig` object as `defineConfig()`.

---

## TypeScript types

All config interfaces are exported from `@jasonshimmy/vite-plugin-cer-app/types`:

```ts
import type {
  CerAppConfig,
  SsgConfig,
  JitCssConfig,
  AutoImportsConfig,
  RuntimeConfig,
  RuntimePublicConfig,
  RuntimePrivateConfig,
  I18nConfig,
  ErrorHookContext,
  RequestHookContext,
  ResponseHookContext,
} from '@jasonshimmy/vite-plugin-cer-app/types'
```
