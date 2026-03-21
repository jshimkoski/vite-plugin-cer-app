# @jasonshimmy/vite-plugin-cer-app — Implementation Plan

Gaps identified by comparing the framework against Nuxt 3 and Next.js 14.
Items are ordered by priority. Each section notes the files touched, the
design rationale, and whether it is in scope for the current sprint.

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ✅ | Done |
| 🔨 | In progress |
| 📋 | Planned (this sprint) |
| 🔜 | Next sprint |
| ❌ | Deferred / out of scope |

---

## Phase 1 — Bugs (sprint 1)

### 1.1 Fix `entry-server-template.ts` phantom import ✅

**Problem:** The template imports `virtual:cer-ssr-config` which is never
generated, crashing any custom `entry-server.ts`.

**Fix:** Inline the config object directly (same pattern `build-ssr.ts` uses).

**Files:** `src/runtime/entry-server-template.ts`

---

### 1.2 Remove dead `middleware` re-export from SSR entry ✅

**Problem:** Static `import middleware from 'virtual:cer-middleware'` in the
server entry caused a Vite warning about dynamic/static import conflict.

**Fix:** Remove the static import; routes handle middleware via their own
`beforeEnter` dynamic import.

**Files:** `src/runtime/entry-server-template.ts`, `src/plugin/build-ssr.ts`

---

## Phase 2 — Missing Wiring (sprint 1)

### 2.1 Layout wrapping ✅

**Problem:** `virtual:cer-layouts` is imported in both the SPA bootstrap and
the SSR entry but is never consumed. Pages with `export const meta = { layout:
'minimal' }` are silently ignored — every page renders without any layout.

**Design:**

*Build time:* `routes.ts` already reads each page file to extract middleware
names. Add `extractLayout()` (same regex approach) and include the result as
`meta: { layout: '...' }` on each route object.

*SPA / client runtime:* Register a `<cer-layout-view>` component inside
`app-template.ts` (after `initRouter`). It closes over `router` and `layouts`.
On every navigation it reads `router.matchRoute(path).route.meta.layout`,
looks up the tag name in the `layouts` map, and returns a VNode:

```
{ tag: 'layout-default', props: {}, children: [{ tag: 'router-view', ... }] }
```

The vdom diff preserves the layout element across navigations that stay on the
same layout, so the header/footer are never unmounted.

`index.html` uses `<cer-layout-view>` instead of `<router-view>` directly.

*SSR runtime:* No reactive component needed. In the `vnodeFactory` inside
`build-ssr.ts` and `entry-server-template.ts`, match the request URL to a
route, read `meta.layout`, and wrap the vnode:

```ts
import layouts from 'virtual:cer-layouts'

const vnodeFactory = (req) => {
  const router = initRouter({ routes, initialUrl: req.url ?? '/' })
  const { route } = router.matchRoute(router.getCurrent().path)
  const layoutName = (route as any)?.meta?.layout ?? 'default'
  const layoutTag = (layouts as Record<string, string>)[layoutName]
  const inner = html`<router-view></router-view>`
  return {
    vnode: layoutTag ? { tag: layoutTag, props: {}, children: [inner] } : inner,
    router,
  }
}
```

**Files:**
- `src/plugin/virtual/routes.ts` — add `extractLayout`, emit `meta`
- `src/runtime/app-template.ts` — register `cer-layout-view`, use `cer-layout-view` in html
- `src/plugin/build-ssr.ts` — layout-aware vnodeFactory
- `src/runtime/entry-server-template.ts` — layout-aware vnodeFactory
- Scaffold templates — `index.html` → `<cer-layout-view>`
- Demo `index.html` — same swap

---

### 2.2 404 / not-found page convention ✅

**Problem:** No automatic fallback. The catch-all `[...all].ts` convention
works but requires the user to know the naming convention.

**Design:** In `routes.ts`, after scanning pages, check whether a file named
`404.ts` (or `404/index.ts`) exists. If it does, treat it as the canonical
not-found route: override its generated path to `/:all*` so it always sorts
last and catches every unmatched URL. The tag name becomes `page-404`.

Users no longer need to know the `[...all]` convention — they just create
`app/pages/404.ts`.

**Files:** `src/plugin/virtual/routes.ts`

---

## Phase 3 — New Conventions (sprint 1)

### 3.1 Loading state — `app/loading.ts` ✅

**Problem:** While a lazy route chunk is loading (`load()` pending), the user
sees a blank page.

**Design:**

*Convention:* If `app/loading.ts` exists, it must export a custom element
named `page-loading` (same auto-import rules apply).

*Virtual module:* `virtual:cer-loading` exports a boolean `hasLoading` and
the tag name `loadingTag` (or `null`).

*Bootstrap:* In `app-template.ts`, wrap `router.push` and `router.replace` to
set a reactive `isNavigating` ref. The `cer-layout-view` component reads this
ref and renders `<page-loading>` in place of the normal layout+page tree while
navigation is pending.

```ts
// In cer-layout-view render fn:
if (isNavigating.value && loadingTag) {
  return { tag: loadingTag, props: {}, children: [] }
}
```

**Files:**
- `src/plugin/virtual/loading.ts` — new generator
- `src/plugin/index.ts` — register `virtual:cer-loading`
- `src/runtime/app-template.ts` — import loading module, wrap push/replace,
  update cer-layout-view
- `src/plugin/dts-generator.ts` — add module declaration
- Demo — add `app/loading.ts`

---

### 3.2 Error page — `app/error.ts` ✅

**Problem:** An uncaught error in any component (or during navigation) leaves
the user with a blank screen and no recovery path.

**Design:**

*Convention:* If `app/error.ts` exists, it must export a custom element named
`page-error`. It receives `error` and `reset` attributes.

*Virtual module:* `virtual:cer-error` exports `hasError` and `errorTag`.

*Bootstrap:* In `app-template.ts`, wrap navigation and component rendering in
a try/catch. On error, set a reactive `currentError` ref. The `cer-layout-view`
component reads `currentError` and renders `<page-error error="…">` when set.
Provide a global `resetError()` function that clears `currentError` and
re-navigates to the current path.

**Files:**
- `src/plugin/virtual/error.ts` — new generator
- `src/plugin/index.ts` — register `virtual:cer-error`
- `src/runtime/app-template.ts` — import error module, error state, reset fn
- `src/plugin/dts-generator.ts` — add module declaration
- Demo — add `app/error.ts`

---

## Phase 4 — DX Improvements (sprint 1)

### 4.1 TypeScript path aliases ✅

**Problem:** Users must use relative imports (`../../composables/useAuth`) when
the conventional `~/composables/useAuth` alias is far more ergonomic.

**Design:** On every `configureServer` and `buildStart`, write a
`cer-tsconfig.json` to the project root:

```json
{
  "compilerOptions": {
    "paths": {
      "~/*": ["./app/*"],
      "~/pages/*": ["./app/pages/*"],
      "~/layouts/*": ["./app/layouts/*"],
      "~/components/*": ["./app/components/*"],
      "~/composables/*": ["./app/composables/*"],
      "~/plugins/*": ["./app/plugins/*"],
      "~/middleware/*": ["./app/middleware/*"],
      "~/assets/*": ["./app/assets/*"]
    }
  }
}
```

Users extend it from `tsconfig.json`:
```json
{ "extends": "./cer-tsconfig.json" }
```

Document this in `getting-started.md`. Do NOT auto-mutate the user's existing
`tsconfig.json` (destructive, opinionated).

**Files:**
- `src/plugin/dts-generator.ts` — add `writeTsconfigPaths()`
- `src/plugin/index.ts` — call in `configureServer` + `buildStart`

---

## Phase 5 — Data Loader Hydration (sprint 2)

### 5.1 Expose loader from `load()` ✅

**Problem:** The `loader` export from page files is called during SSR/SSG
(`build-ssg.ts` calls it via `ssrLoadModule`) but the result is never
serialized into the HTML. Clients refetch data on hydration.

**Design:**

*Route generation:* Change `load()` to return `{ default: tagName, loader: mod.loader }`:

```ts
const loadFn = `() => import(${filePath}).then(mod => ({
  default: ${tagName},
  loader: mod.loader ?? null,
}))`
```

*SSR entry:* After `router.push(url)`, call the matched route's `load()` to
get the loader function. Invoke it with `{ params, query, req }`. Inject the
serialized result as `window.__CER_DATA__` into the HTML `<head>`:

```html
<script>window.__CER_DATA__ = {"title":"Hello","body":"…"}</script>
```

*Client:* In `entry-client-template.ts`, read `window.__CER_DATA__` and pass
it as initial props to the matched page component before hydration.

*Component:* Page components call `useProps()` — on first render in the browser
the props come from `window.__CER_DATA__` (if present), bypassing the `loader`
fetch.

**Complexity:** Medium-high. Requires threading loader calls through the SSR
handler and the SSG pipeline. Deferred to sprint 2.

**Files:**
- `src/plugin/virtual/routes.ts` — expose loader in load() return value
- `src/runtime/entry-server-template.ts` — call loader, inject __CER_DATA__
- `src/plugin/build-ssr.ts` — same in generated server entry
- `src/plugin/build-ssg.ts` — inject __CER_DATA__ into rendered HTML
- `src/runtime/entry-client-template.ts` — read __CER_DATA__ on boot

---

## Phase 6 — Production Features (sprint 2–3)

### 6.1 ISR — Incremental Static Regeneration ✅

**Problem:** `ssg.fallback: true` is in the config but not implemented.
Without ISR, large sites must either SSR every request or rebuild on every
content change.

**Design:** Implement a two-layer cache in the SSR preview server:
- First request for an unknown path: render server-side, cache result in memory
  (or on disk), serve rendered HTML.
- Subsequent requests within the TTL: serve cached HTML.
- After TTL expires: serve stale HTML, re-render in background, update cache.

Requires a `revalidate` option per route (via `meta.ssg.revalidate: 60`).

**Files:**
- `src/cli/commands/preview.ts` — ISR cache layer
- `src/plugin/virtual/routes.ts` — include `meta.ssg.revalidate` in route
- `src/types/page.ts` — add `revalidate` to `PageSsgConfig`

---

### 6.2 Nested layouts ✅

**Problem:** All pages share a single layout level. A `/admin/*` section with
its own sidebar inside the root layout requires copy-pasting layout structure
today.

**Design:** Introduce layout nesting via directory-level `_layout.ts` files:

```
app/layouts/default.ts       ← root layout (has <slot>)
app/layouts/admin.ts         ← admin layout (has <slot>)
app/pages/admin/_layout.ts   ← layout override for /admin/* subtree
app/pages/admin/dashboard.ts
```

The framework builds a layout chain. `cer-layout-view` renders the chain from
outermost to innermost, each wrapping the next in its `<slot>`.

**Complexity:** High. Requires recursive layout resolution and changes to the
router's route objects.

---

### 6.3 Per-route render strategy 🔜

**Problem:** All routes use the same mode (SPA / SSR / SSG). Nuxt's route
rules allow mixing: some routes rendered statically, some on the server, some
as SPA.

**Design:** Add `meta.render: 'static' | 'server' | 'spa'` to page files.
Build pipeline splits pages by strategy and applies the right renderer to each.

**Complexity:** Very high. Requires splitting the build pipeline.

---

### 6.4 Link prefetching ✅

**Problem:** `<router-link>` doesn't prefetch route chunks on hover/visible.

**Design:** Add an `IntersectionObserver` to `router-link` that calls
`route.load()` when the link enters the viewport. The component-loader cache
(LRU) already exists — prefetching just populates it early.

This is a runtime change, not a plugin change.

**Files:** `custom-elements/src/lib/router/instance.ts` — update router-link

---

### 6.5 Route transitions ✅

The runtime already has `transition-group-handler.ts` and `transition-utils.ts`.
`meta.transition` is now extracted at build time and available on `route.meta`.

**Convention:** `export const meta = { transition: 'fade' }` in any page file.
Set to `true` for the default `'page'` transition name.

**Files:**
- `src/types/page.ts` — added `transition?: string | boolean` to `PageMeta`
- `src/plugin/virtual/routes.ts` — added `extractTransition()`, included in meta

---

## Phase 6b — Public env vars / runtimeConfig ✅

**Problem:** No typed, centralized place to expose env vars to both server and
client. Users had to use `import.meta.env.VITE_*` directly everywhere.

**Design:** Add `runtimeConfig.public` to `CerAppConfig`. Values are serialized
into `virtual:cer-app-config` at build time and accessible via `useRuntimeConfig()`.

```ts
// cer.config.ts
export default defineConfig({
  runtimeConfig: {
    public: {
      apiBase: process.env.VITE_API_BASE ?? '/api',
    },
  },
})

// any page or composable
const config = useRuntimeConfig()
fetch(config.public.apiBase + '/posts')
```

**Files:**
- `src/types/config.ts` — added `RuntimeConfig`, `RuntimePublicConfig`, `runtimeConfig` to `CerAppConfig`
- `src/plugin/dev-server.ts` — added `runtimeConfig` to `ResolvedCerConfig`
- `src/plugin/index.ts` — `resolveConfig` + `generateAppConfigModule` emit `runtimeConfig`
- `src/runtime/composables/use-runtime-config.ts` — new `useRuntimeConfig()` + `initRuntimeConfig()`
- `src/runtime/composables/index.ts` — re-export
- `src/runtime/app-template.ts` — calls `initRuntimeConfig(runtimeConfig)` on boot
- `src/runtime/entry-server-template.ts` — same on server boot
- `src/plugin/dts-generator.ts` — `useRuntimeConfig` global + `virtual:cer-app-config` module decl

---

## Phase 7 — Ecosystem (sprint 4+)

### 7.1 DevTools overlay ❌

Browser extension / overlay showing current route, matched layout, active
middleware, virtual module contents.

### 7.2 i18n integration ❌

Convention for `app/i18n/` locale files. Auto-injected `useI18n()` composable.
`cer-app i18n extract` CLI command.

### 7.3 Edge runtime adapter ❌

Cloudflare Workers / Deno Deploy adapter. Requires replacing Node's
`createStreamingSSRHandler` with a Web Streams equivalent.

---

## Summary Table

| # | Item | Sprint | Status |
|---|------|--------|--------|
| 1.1 | Fix entry-server-template phantom import | 1 | ✅ |
| 1.2 | Remove dead middleware re-export | 1 | ✅ |
| 2.1 | Layout wrapping (SPA + SSR) | 1 | ✅ |
| 2.2 | 404 page convention | 1 | ✅ |
| 3.1 | Loading state — `app/loading.ts` | 1 | ✅ |
| 3.2 | Error page — `app/error.ts` | 1 | ✅ |
| 4.1 | TypeScript path aliases | 1 | ✅ |
| 5.1 | Data loader hydration | 2 | ✅ |
| 6.1 | ISR | 2–3 | ✅ |
| 6.2 | Nested layouts | 2–3 | ✅ |
| 6.3 | Per-route render strategy | 3 | 🔜 |
| 6.4 | Link prefetching | 3 | ✅ |
| 6.5 | Route transitions | 3 | ✅ |
| 6b | runtimeConfig / public env vars | 2 | ✅ |
| 7.1 | DevTools | 4+ | ❌ |
| 7.2 | i18n | 4+ | ❌ |
| 7.3 | Edge runtime | 4+ | ❌ |
