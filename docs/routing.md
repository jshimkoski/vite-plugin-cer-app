# Routing

Routes are automatically derived from files in the `app/pages/` directory. No manual route registration is required.

---

## File → route mapping

| File | Route path | Component tag |
|---|---|---|
| `app/pages/index.ts` | `/` | `page-index` |
| `app/pages/about.ts` | `/about` | `page-about` |
| `app/pages/blog/index.ts` | `/blog` | `page-blog` |
| `app/pages/blog/[slug].ts` | `/blog/:slug` | `page-blog-slug` |
| `app/pages/users/[id]/edit.ts` | `/users/:id/edit` | `page-users-id-edit` |
| `app/pages/404.ts` | `/:all*` (catch-all) | `page-404` |
| `app/pages/[...all].ts` | `/:all*` (catch-all) | `page-all` |
| `app/pages/(auth)/login.ts` | `/login` | `page-login` |

### Rules

1. **`index.ts`** — The `index` segment is stripped: `blog/index.ts` → `/blog`
2. **`[param]`** — Dynamic segment: `[slug].ts` → `:slug`
3. **`[...rest]`** — Catch-all segment: `[...all].ts` → `/:all*`
4. **`404.ts`** — Special shorthand: treated as a catch-all (`/:all*`) — the conventional 404 page
5. **`(group)/`** — Route group: directory name stripped from path, not from tag name

---

## Defining a page

Every file in `app/pages/` must call `component()` to register a custom element. The tag name is derived from the file path.

```ts
// app/pages/index.ts
component('page-index', () => {
  return html`<h1>Home</h1>`
})
```

Because `autoImports.runtime` is `true` by default, `component` and `html` are injected automatically — no import statement is needed.

---

## Dynamic segments

Use square brackets in the filename to create a dynamic segment:

```ts
// app/pages/blog/[slug].ts
component('page-blog-slug', () => {
  const props = useProps({ slug: '' })

  return html`<h1>${props.slug}</h1>`
})
```

The `:slug` param is populated by the router and passed as a prop to the component.

---

## Catch-all routes and 404 pages

`404.ts` and `[...all].ts` both map to the same route pattern (`/:all*`), but they are not the same thing semantically:

- `404.ts` is the conventional not-found route. It should render your 404 UI, and the framework treats it as a real HTTP 404 route.
- `[...all].ts` is a general catch-all route. It can be used for not-found pages, but it is also the right choice for content-driven routing where valid URLs are resolved at runtime.

Use `404.ts` when the route is truly your global not-found page. Use `[...all].ts` when the route needs application logic to decide whether the current URL is valid.

**Option A — `404.ts` (recommended for true not-found pages)**

```ts
// app/pages/404.ts
component('page-404', () => {
  return html`
    <div>
      <h1>404 — Page not found</h1>
      <p><a href="/">← Back home</a></p>
    </div>
  `
})
```

The framework special-cases `404.ts` and automatically registers it as the catch-all route (`/:all*`). In SSR/SSG, it is treated as a real not-found route and returns HTTP 404.

**Option B — `[...name].ts` explicit catch-all**

```ts
// app/pages/[...all].ts
component('page-all', () => {
  return html`<h1>404 — Page not found</h1>`
})
```

This still produces the same route pattern (`/:all*`), but unlike `404.ts` it is not assumed to be a 404 by default. If the page successfully resolves data for the current URL, the response stays HTTP 200. If the page decides the URL is missing, throw or return a 404 from your loader explicitly.

This is the pattern to use for content-driven sites, documentation trees, storefront catalogs, and other apps where one catch-all page resolves many valid nested URLs.

**Synthetic 404 fallback (automatic)**

If your app defines **no** catch-all route at all (neither `404.ts` nor `[...all].ts`), the framework injects a synthetic `/:all*` route that returns HTTP 404 without crashing. This protects production SSR apps from returning 500 for unknown paths during the period before you add a real 404 page.

The synthetic route:
- Returns `HTTP 404` in SSR mode
- Renders the global error component (`app/error.ts`) if one is defined, passing `error="Not Found"` and `status="404"` as attributes
- Renders an empty `<div>` if no error component is defined

Add a real `404.ts` to customize the experience; the synthetic fallback is removed automatically once one exists.

Note that `app/error.ts` is a global error boundary, not a route page. You can also define per-route error boundaries with `foo.error.ts` or directory-level `_error.ts`. See [data-loading.md](./data-loading.md#error-boundary--apperrorts) for the global error page and the route-level error-boundary section later in this guide for per-route overrides.

---

## Route groups

Wrap a directory name in parentheses to create a route group. The directory is excluded from the URL path but the files inside are still scanned:

```
app/pages/
  (auth)/
    login.ts    → /login
    register.ts → /register
  dashboard.ts  → /dashboard
```

Route groups are useful for collocating related pages without affecting their URLs.

### Nested route groups

Multiple route-group segments can be nested. All parenthesised segments are stripped when computing the URL path:

```
app/pages/
  (auth)/
    (admin)/
      settings.ts   → /settings
  (marketing)/
    about.ts        → /about
```

The component tag name is also derived from the full file path — group segments are stripped from the tag name as well:

| File | Route path | Component tag |
|---|---|---|
| `(auth)/login.ts` | `/login` | `page-login` |
| `(auth)/(admin)/settings.ts` | `/settings` | `page-settings` |

---

## i18n routing

When `i18n` is configured in `cer.config.ts`, the build system automatically generates locale-prefixed route variants for every page. You do not need to duplicate your page files.

```ts
// cer.config.ts
export default defineConfig({
  i18n: {
    locales: ['en', 'fr', 'de'],
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
  },
})
```

With the above config, `app/pages/about.ts` produces:

| Path | Locale |
|---|---|
| `/about` | `en` (default) |
| `/fr/about` | `fr` |
| `/de/about` | `de` |

Both routes load the same page component — only the detected locale differs.

Use `useLocale()` inside your pages and components to read the current locale and generate locale-aware links. `useLocale()` is auto-imported — no import statement is needed.

See [i18n.md](./i18n.md) for full configuration options, strategies, `switchLocalePath`, SSR/SSG behavior, and a locale switcher example.

---

## Page metadata (`meta` export)

Export a `meta` object from any page file to customize behavior:

```ts
// app/pages/blog/[slug].ts
import type { PageMeta } from '@jasonshimmy/vite-plugin-cer-app/types'

component('page-blog-slug', () => { /* ... */ })

export const meta: PageMeta = {
  // Which layout wraps this page (defaults to 'default' if app/layouts/default.ts exists)
  layout: 'default',

  // Named middleware to run before this page loads
  middleware: ['auth'],

  // Per-page hydration strategy
  hydrate: 'load', // 'load' | 'idle' | 'visible' | 'none'

  // SSG: enumerate paths for dynamic routes
  ssg: {
    paths: async () => [
      { params: { slug: 'hello-world' } },
      { params: { slug: 'second-post' } },
    ],
  },
}
```

### `meta.layout`

Which layout to wrap this page in. The value must match a filename (without extension) in `app/layouts/`. Set to `false` or `''` (empty string) to render the page without any layout, or omit to use the default layout.

### `meta.middleware`

Array of named middleware to run before navigating to this page. Names must match files in `app/middleware/` (without extension).

### `meta.hydrate`

Controls when the page component activates (hydrates) on the client after SSR. The server always renders full HTML regardless of this setting — it only affects client-side JS activation timing.

| Value | Behavior | Browser API |
|---|---|---|
| `'load'` | Hydrates immediately on page load (default) | — |
| `'idle'` | Defers until the browser has finished higher-priority work | `requestIdleCallback` (falls back to `setTimeout` in Safari) |
| `'visible'` | Defers until `<cer-layout-view>` enters the viewport (falls back to observing `document.body` if `<cer-layout-view>` is not found) | `IntersectionObserver` |
| `'none'` | Never hydrates — SSR HTML stays as-is, no JS activation | — |

```ts
// app/pages/marketing.ts — defer activation until idle
export const meta = {
  hydrate: 'idle',
}

// app/pages/legal/terms.ts — fully static, no JS needed
export const meta = {
  hydrate: 'none',
}
```

**`'none'` and `usePageData`:** When `hydrate: 'none'` is set, the page component never activates and `usePageData()` loader data is not consumed. Avoid using `loader` on pages with `hydrate: 'none'` — the serialized `window.__CER_DATA__` will be present in the HTML but never read or cleaned up by the client.

**SPA mode:** `meta.hydrate` has no effect in SPA mode — there is no SSR output to preserve, so the component always activates immediately.

### `meta.ssg.paths`

Required for dynamic routes in SSG mode. Returns an array of `{ params }` objects, one per URL to generate:

```ts
export const meta = {
  ssg: {
    paths: async () => {
      const posts = await fetch('/api/posts').then(r => r.json())
      return posts.map((post) => ({ params: { slug: post.slug } }))
    },
  },
}
```

Catch-all pages can use `meta.ssg.paths` too:

```ts
// app/pages/[...all].ts
export const meta = {
  ssg: {
    paths: async () => [
      { params: { all: 'docs/getting-started' } },
      { params: { all: 'docs/routing' } },
    ],
  },
}
```

For content-backed catch-all pages that resolve URLs with `queryContent()`, SSG can also auto-discover concrete paths from the content store when `ssg.routes` is set to `'auto'`.

### `meta.ssg.revalidate`

**Type:** `number` (seconds)

Enables Incremental Static Regeneration (ISR) for the route. When set, the preview server caches the rendered HTML and serves it until the TTL expires. After expiry, stale HTML is served immediately while a fresh render runs in the background (stale-while-revalidate).

```ts
// app/pages/blog/[slug].ts
export const meta = {
  ssg: {
    revalidate: 60,  // re-render at most once per minute
    paths: async () => { /* ... */ },
  },
}
```

See [Rendering Modes — ISR](rendering-modes.md#isr--incremental-static-regeneration) for full details.

### `meta.transition`

**Type:** `string | boolean`

Attaches transition metadata to the route. The value is extracted at build time and emitted as `meta.transition` on the route object — the framework does **not** apply any CSS or DOM changes automatically.

```ts
// app/pages/about.ts
export const meta = {
  transition: 'fade',   // stored as route.meta.transition at runtime
}
```

Read the value in your navigation handler or layout to implement transitions yourself:

```ts
import routes from 'virtual:cer-routes'
const about = routes.find(r => r.path === '/about')
// about.meta.transition → 'fade'
```

Example — apply a CSS class during navigation using a plugin:

```ts
// app/plugins/transitions.ts
export default {
  setup({ router }) {
    router.subscribe((to) => {
      const name = to.meta?.transition
      if (name) document.documentElement.setAttribute('data-transition', String(name))
      else document.documentElement.removeAttribute('data-transition')
    })
  },
}
```

```css
[data-transition="fade"] cer-layout-view {
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn {
  from { opacity: 0 }
  to   { opacity: 1 }
}
```

Set to `false` to explicitly mark a page as having no transition (useful when a catch-all or default would otherwise apply one).

### `meta.render`

**Type:** `'static' | 'server' | 'spa'`

Overrides the global rendering mode for a single route. Useful in mixed apps where most pages share one strategy but a few need different treatment.

| Value | Behavior |
|---|---|
| `'server'` | Always renders server-side. In SSG mode the route is **skipped** during the static build — it is never pre-rendered. |
| `'static'` | Always serves pre-rendered HTML from disk. In the SSR **preview server**, the framework looks for `dist/<path>/index.html`; falls back to SSR if the file is not found. In SSG mode the route is still pre-rendered at build time as normal. |
| `'spa'`    | Client-only. In SSR mode the server returns the SPA shell (`index.html`) without rendering. In SSG mode the route is skipped. |

```ts
// app/pages/dashboard.ts — always SSR even in an otherwise SSG app
export const meta = {
  render: 'server',
}
```

```ts
// app/pages/profile.ts — client-only (auth wall, no crawlable content)
export const meta = {
  render: 'spa',
}
```

```ts
// app/pages/legal/privacy.ts — force static even in SSR mode
export const meta = {
  render: 'static',
}
```

---

### Per-route error components

You can co-locate an error component alongside any page file. When the page's `loader` throws, the framework renders the error component instead of the global `app/error.ts` fallback.

**Two file conventions are supported:**

| File | Scope |
|---|---|
| `app/pages/foo.error.ts` | Error boundary for `app/pages/foo.ts` only |
| `app/pages/blog/_error.ts` | Error boundary for every page under `app/pages/blog/` |

Both files are **excluded from the route list** — they are never reachable as standalone routes.

```ts
// app/pages/blog/[slug].error.ts
component('page-blog-slug-error', () => {
  const props = useProps({ error: '', status: '' })

  return html`
    <div>
      <h1>Post unavailable (${props.status})</h1>
      <p>${props.error}</p>
      <a href="/blog">← Back to blog</a>
    </div>
  `
})
```

The error component receives `error` (the thrown error message) and `status` (the HTTP status code, e.g. `"422"` or `"500"`) as string attributes.

**Resolution order:** page-level (`foo.error.ts`) > directory-level (`_error.ts`) > global (`app/error.ts`).

---

## Route sorting

When multiple routes are matched, the router resolves them in this priority order:

1. **Static routes** — exact path matches (e.g. `/about`)
2. **Dynamic routes** — paths with parameters (e.g. `/blog/:slug`)
3. **Catch-all routes** — `/*` last

Within each tier, routes are sorted alphabetically.

---

## Navigation with `<router-link>`

`initRouter()` registers a `<router-link>` built-in custom element that renders a client-side navigation link. Use it anywhere in your pages or layouts instead of a plain `<a>` tag when you want the router to handle the navigation (no full page reload):

```ts
// app/layouts/default.ts
component('layout-default', () => {
  return html`
    <nav>
      <router-link to="/">Home</router-link>
      <router-link to="/about">About</router-link>
      <router-link to="/blog">Blog</router-link>
    </nav>
    <main><slot></slot></main>
  `
})
```

`<router-link to="/path">` calls `router.push(path)` on click, which triggers the wrapped navigation handler (loading state, error capture, etc.). Use a plain `<a href="/path">` when you need a standard browser navigation or an external link.

---

## Loading state — `app/loading.ts`

Create `app/loading.ts` to display a loading indicator while a route chunk is being fetched during client-side navigation. The file must export a custom element named `page-loading`:

```ts
// app/loading.ts
component('page-loading', () => {
  return html`
    <div style="display:flex;align-items:center;gap:8px;padding:1rem">
      <span style="width:14px;height:14px;border:2px solid #ccc;border-top-color:#555;border-radius:50%;animation:spin 0.7s linear infinite;display:inline-block"></span>
      Loading…
      <style>@keyframes spin { to { transform: rotate(360deg) } }</style>
    </div>
  `
})
```

**Behaviour:**

- `page-loading` is rendered in place of the normal layout + page tree while the route chunk is being loaded.
- Once the chunk resolves and the page is ready to render, `page-loading` is replaced automatically.
- `page-loading` is never included in SSR or SSG output — it only appears during client-side navigation.

If `app/loading.ts` does not exist, navigation proceeds without any intermediate state (the previous page stays visible until the new one is ready).

---

## Virtual module

The route list is exposed as the virtual module `virtual:cer-routes`, which you can import in any plugin or composable:

```ts
import routes from 'virtual:cer-routes'

// routes is an array of:
// { path: string, component: string, load: () => Promise<module> }
```

The `load` function is a dynamic import back to the original page file, enabling code splitting per route.
