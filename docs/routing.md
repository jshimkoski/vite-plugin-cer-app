# Routing

Routes are automatically derived from files in the `app/pages/` directory. No manual route registration is required.

---

## File → route mapping

| File | Route path | Component tag |
|---|---|---|
| `app/pages/index.ts` | `/` | `page-index` |
| `app/pages/about.ts` | `/about` | `page-about` |
| `app/pages/blog/index.ts` | `/blog` | `page-blog-index` |
| `app/pages/blog/[slug].ts` | `/blog/:slug` | `page-blog-slug` |
| `app/pages/users/[id]/edit.ts` | `/users/:id/edit` | `page-users-id-edit` |
| `app/pages/[...all].ts` | `/*` (catch-all) | `page-all` |
| `app/pages/(auth)/login.ts` | `/login` | `page-login` |

### Rules

1. **`index.ts`** — The `index` segment is stripped: `blog/index.ts` → `/blog`
2. **`[param]`** — Dynamic segment: `[slug].ts` → `:slug`
3. **`[...rest]`** — Catch-all segment: `[...all].ts` → `/*`
4. **`(group)/`** — Route group: directory name stripped from path, not from tag name

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

## Catch-all routes

A file named `[...anything].ts` matches any path not matched by a more specific route:

```ts
// app/pages/[...all].ts
component('page-all', () => {
  return html`<h1>404 — Page not found</h1>`
})
```

This also serves as the 404 page. The catch-all segment matches `/*`.

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

Which layout to wrap this page in. The value must match a filename (without extension) in `app/layouts/`. Set to `false` or omit if you don't want a layout.

### `meta.middleware`

Array of named middleware to run before navigating to this page. Names must match files in `app/middleware/` (without extension).

### `meta.hydrate`

Controls when the component hydrates on the client after SSR:

| Value | Behavior |
|---|---|
| `'load'` | Hydrates immediately on page load |
| `'idle'` | Hydrates when the browser is idle |
| `'visible'` | Hydrates when the element enters the viewport |
| `'none'` | Never hydrates (static HTML only) |

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

---

## Route sorting

When multiple routes are matched, the router resolves them in this priority order:

1. **Static routes** — exact path matches (e.g. `/about`)
2. **Dynamic routes** — paths with parameters (e.g. `/blog/:slug`)
3. **Catch-all routes** — `/*` last

Within each tier, routes are sorted alphabetically.

---

## Virtual module

The route list is exposed as the virtual module `virtual:cer-routes`, which you can import directly in `app/app.ts`:

```ts
import routes from 'virtual:cer-routes'

// routes is an array of:
// { path: string, component: string, load: () => Promise<module> }
```

The `load` function is a dynamic import back to the original page file, enabling code splitting per route.
