# @jasonshimmy/vite-plugin-cer-app — Production Roadmap

This document captures the next steps needed to make the framework production-grade.
All items in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) (Phases 1–6b) are complete.

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ✅ | Done |
| 🔨 | In progress |
| 📋 | Planned (next sprint) |
| 🔜 | Future sprint |
| ❌ | Deferred / out of scope |

---

## Phase 8 — Security & Production Hardening

### 8.1 Fix path traversal in preview server ✅

**Problem:** `serveStaticFile` in `src/cli/commands/preview.ts` computes
`join(distDir, urlPath)` without bounding the result. A raw HTTP client can
send `GET /../../../../etc/nginx/nginx.conf` and `pathe.join` resolves the
`..` segments outside `distDir`, potentially exposing arbitrary files.

**Fix:** After joining, assert the resolved path starts with `resolve(distDir)`
before opening the file.

**Files:** `src/cli/commands/preview.ts`

---

### 8.2 `runtimeConfig.private` — server-only secrets ✅

**Problem:** Currently only `runtimeConfig.public` exists. Any value placed
in `runtimeConfig` is serialized into the client bundle at build time. There
is no typed, server-only slot for secrets like database URLs or API keys.

**Design:**

- Add `runtimeConfig.private` to `CerAppConfig`. Values are declared with
  defaults (empty strings) in `cer.config.ts` for typing purposes.
- At build time, the server bundle (`virtual:cer-app-config` in SSR mode)
  exports `_runtimePrivateDefaults` — the declared keys with their defaults.
  The client bundle never sees these.
- At **server startup**, `entry-server-template.ts` reads `process.env[key]`
  for each private key, overriding the default. Secrets never appear in
  bundled artifacts.
- `useRuntimeConfig()` returns `{ public, private }` on the server and
  `{ public }` on the client.

```ts
// cer.config.ts
export default defineConfig({
  runtimeConfig: {
    public: { apiBase: process.env.VITE_API_BASE ?? '/api' },
    private: { dbUrl: '', secretKey: '' },
  },
})

// app/pages/dashboard.ts — loader (server-only)
export const loader = async () => {
  const { private: priv } = useRuntimeConfig()
  const rows = await db.query(priv.dbUrl)
  return { rows }
}
```

**Files:**
- `src/types/config.ts` — add `RuntimePrivateConfig`, update `RuntimeConfig`
- `src/plugin/index.ts` — `resolveConfig` + `generateAppConfigModule` (SSR-aware), `load` hook passes `ssr` flag
- `src/runtime/composables/use-runtime-config.ts` — support `private`
- `src/runtime/entry-server-template.ts` — resolve env vars at startup
- `src/plugin/dts-generator.ts` — update `virtual:cer-app-config` declaration

---

### 8.3 Preview server hardening 📋

**Problem:** The preview server (`cer-app preview`) is used in CI and staging
but lacks basic production safeguards.

**Missing:**
- Security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`)
- Request timeouts (slow clients hold connections open indefinitely)
- Request body size limits
- Graceful shutdown (drain in-flight requests before `process.exit`)
- `Cache-Control` with long TTLs for content-hashed assets (currently `no-cache`
  for everything)

**Files:** `src/cli/commands/preview.ts`

---

## Phase 9 — Auth Primitives

### 9.1 Client-side route middleware (navigation guards) ✅

**Problem:** There is no way to intercept client-side navigations to redirect
unauthenticated users, check permissions, or run analytics before a page renders.

**Design:**

The `@jasonshimmy/custom-elements-runtime` router ships with per-route
navigation guards built in:

```ts
// Router guard API (from custom-elements-runtime)
interface Route {
  beforeEnter?: (to: RouteState, from: RouteState) => GuardResult
  onEnter?:     (to: RouteState, from: RouteState) => GuardResult
  afterEnter?:  (to: RouteState, from: RouteState) => void | Promise<void>
}

type GuardResult = boolean | string | Promise<boolean | string>
// true  → allow navigation
// false → block navigation
// string → redirect to that path
```

Guards receive:
```ts
interface RouteState {
  path: string
  params: Record<string, string>
  query: Record<string, string>
  fragment?: string
}
```

The framework wires these guards automatically via `meta.middleware`:

*Convention:* Files in `app/middleware/` export a default `MiddlewareFn`.
A page opts in by listing middleware names in `meta.middleware`.

```ts
// app/middleware/auth.ts
export default defineMiddleware(async (to, from) => {
  const isLoggedIn = checkSession()
  if (!isLoggedIn) return '/login'   // redirect
  return true                         // allow
})

// app/pages/dashboard.ts
export const meta = { middleware: ['auth'] }
```

*Virtual module:* `virtual:cer-middleware` exports an eager map:
```ts
import auth from '/app/middleware/auth.ts'
export const middleware = { auth }
```

*Route generation:* `virtual:cer-routes` generates a `beforeEnter` guard
for any route that has `meta.middleware`. The guard dynamically imports
`virtual:cer-middleware`, runs each named function in order, and propagates
the first non-`true` result (redirect string or `false`) to the router.

**Guard execution order:**
1. `beforeEnter` fires — early redirect/block opportunity
2. `onEnter` fires — final gate before route state commits
3. Route state updates in the router store
4. `afterEnter` fires — fire-and-forget (analytics, logging)

**Redirect loop detection:** The router stops after 10 consecutive redirects
to prevent infinite loops.

*Composable:*
```ts
// defineMiddleware gives TypeScript types without a runtime cost
export function defineMiddleware(fn: MiddlewareFn): MiddlewareFn { return fn }
```

**Files:**
- `src/plugin/virtual/routes.ts` — generate `beforeEnter` using return-value API
- `src/plugin/virtual/middleware.ts` — already generates the middleware map ✅
- `src/runtime/composables/define-middleware.ts` — new composable
- `src/runtime/composables/index.ts` — re-export
- `src/types/middleware.ts` — update `RouteMiddleware` to return-value API
- `src/plugin/dts-generator.ts` — add `defineMiddleware` global

---

### 9.2 `useCookie()` composable 📋

**Problem:** Session-based auth requires manual `document.cookie` parsing on
the client and `req.headers.cookie` parsing in loaders. No isomorphic helper
exists.

**Design:** `useCookie(name, options?)` — reads from `req.headers.cookie`
during SSR (via `AsyncLocalStorage` request context) and from
`document.cookie` on the client. Writing sets `Set-Cookie` on the server
response during SSR and `document.cookie` on the client.

**Complexity:** Medium. Requires threading the `res` object into the
`AsyncLocalStorage` data store so `useCookie` can write headers server-side.

---

## Phase 10 — Platform Adapters

### 10.1 Cloudflare Workers adapter 🔜

**Problem:** The server bundle uses Node.js streams (`AsyncLocalStorage`,
`createReadStream`, `IncomingMessage`). Cloudflare Workers run a Web
platform environment without these.

**Design:**
- Replace `renderToStreamWithJITCSSDSD` with a Web Streams equivalent in
  `entry-server-template.ts` when the `cloudflare` adapter is selected.
- Swap `AsyncLocalStorage` with `AsyncContext` (TC39 proposal, available in
  Workers) or a request-scoped `Map`.
- The adapter wraps the handler as a `fetch(Request): Response` function.
- Build output: a single `worker.js` compatible with `wrangler deploy`.

**Complexity:** High. Requires a new server entry template and build pipeline
changes.

---

### 10.2 Vercel adapter 🔜

**Problem:** Vercel expects functions in `.vercel/output/functions/` with a
specific manifest format.

**Design:** A post-build adapter that moves `dist/server/server.js` into the
Vercel output directory and writes the required `config.json` manifests.
Static assets are moved to `.vercel/output/static/`.

**Complexity:** Medium. Mostly file system manipulation.

---

### 10.3 Netlify adapter 🔜

Similar to Vercel but targets Netlify Functions / Edge Functions format.

---

## Phase 11 — DX & Ecosystem

### 11.1 DevTools overlay ❌

Browser overlay showing current route, active layout chain, middleware chain,
ISR cache state, and virtual module contents.

### 11.2 i18n 🔜

Convention: `app/i18n/en.json` + `app/i18n/fr.json`. Auto-injected
`useI18n()` composable that reads the active locale from a cookie/query param.
`cer-app i18n extract` CLI command for string extraction.

### 11.3 `useSeoMeta()` 📋

Thin wrapper around `useHead()` covering OpenGraph, Twitter cards, and
canonical URL. No new infrastructure needed — all forwarded to `<head>`.

---

## Summary Table

| # | Item | Priority | Status |
|---|------|----------|--------|
| 8.1 | Path traversal fix in preview server | 🔴 Critical | ✅ |
| 8.2 | `runtimeConfig.private` (server-only secrets) | 🔴 Critical | ✅ |
| 8.3 | Preview server hardening (headers, timeouts, graceful shutdown) | 🟡 High | 📋 |
| 9.1 | Client-side route middleware (navigation guards) | 🟡 High | ✅ |
| 9.2 | `useCookie()` composable | 🟡 High | 📋 |
| 10.1 | Cloudflare Workers adapter | 🟢 Medium | 🔜 |
| 10.2 | Vercel adapter | 🟢 Medium | 🔜 |
| 10.3 | Netlify adapter | 🟢 Medium | 🔜 |
| 11.1 | DevTools overlay | 🟢 Medium | ❌ |
| 11.2 | i18n | 🟢 Medium | 🔜 |
| 11.3 | `useSeoMeta()` | 🟢 Medium | 📋 |
