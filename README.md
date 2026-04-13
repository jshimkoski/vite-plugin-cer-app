# @jasonshimmy/vite-plugin-cer-app

A Nuxt/Next.js-style meta-framework built on top of [`@jasonshimmy/custom-elements-runtime`](https://github.com/jasonshimmy/custom-elements-runtime). Turns any Vite project into a full-stack application with file-based routing, server-side rendering, static site generation, server API routes, and more — all through native Web Components.

---

## Features

- **File-based routing** — `app/pages/` directory maps directly to routes
- **Layouts** — `app/layouts/` with `<slot>` composition
- **Three rendering modes** — SPA, SSR (streaming), and SSG
- **Server API routes** — `server/api/` with per-method handlers (`GET`, `POST`, …)
- **Auto-imports** — runtime APIs (`component`, `html`, `ref`, …) injected automatically in page files
- **Data loading** — `loader` export per page; serialized server→client via `window.__CER_DATA__`
- **`useHead()`** — document head management (title, meta, OG tags) with SSR injection
- **App plugins** — ordered plugin loading with DI via `provide`/`inject`
- **Route middleware** — global and per-page guards
- **Server middleware** — CORS, auth, and other HTTP-level middleware
- **JIT CSS** — Tailwind-compatible, build-time via the runtime's `cerPlugin`
- **HMR** — virtual module invalidation when pages/components are added or removed

---

## Installation

```sh
npm install -D @jasonshimmy/vite-plugin-cer-app
npm install @jasonshimmy/custom-elements-runtime
```

Add the plugin to `vite.config.ts`:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { cerApp } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  plugins: [cerApp()],
})
```

Or use a `cer.config.ts` alongside `vite.config.ts` (the CLI reads this automatically):

```ts
// cer.config.ts
import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  mode: 'spa', // 'spa' | 'ssr' | 'ssg'
})
```

---

## Quickstart with the CLI

The fastest path is scaffolding a new project:

```sh
npx --package @jasonshimmy/vite-plugin-cer-app create-cer-app my-app
# → choose spa / ssr / ssg
cd my-app
npm install
npm run dev
```

> **Note:** The `--package` flag is required because `create-cer-app` is bundled inside `@jasonshimmy/vite-plugin-cer-app` rather than published as a standalone package.

Or install the CLI globally to skip the flag entirely:

```sh
npm install -g @jasonshimmy/vite-plugin-cer-app
create-cer-app my-app
cer-app dev
```

---

## Project Structure

```
my-app/
├── app/                        # All client-side app code
│   ├── pages/
│   │   ├── index.ts            # → route /
│   │   ├── about.ts            # → route /about
│   │   ├── blog/
│   │   │   ├── index.ts        # → route /blog
│   │   │   └── [slug].ts       # → route /blog/:slug
│   │   └── [...all].ts         # → catch-all /*
│   ├── layouts/
│   │   └── default.ts          # Default layout wrapper
│   ├── components/             # Auto-registered custom elements
│   ├── composables/            # Auto-imported composables
│   ├── plugins/                # App plugins (01.store.ts → loaded first)
│   └── middleware/             # Global route middleware
├── server/
│   ├── api/
│   │   ├── users/
│   │   │   ├── index.ts        # GET/POST /api/users
│   │   │   └── [id].ts         # GET/PUT/DELETE /api/users/:id
│   │   └── health.ts           # GET /api/health
│   └── middleware/             # Server-only HTTP middleware
├── public/                     # Copied as-is to dist/
├── index.html                  # HTML entry
└── cer.config.ts               # Framework config
```

> `.cer/` is auto-generated on every dev/build and gitignored. The framework bootstrap (`app.ts`) lives there and is never user-owned — plugin updates propagate automatically.

---

## Pages

Every file in `app/pages/` defines a custom element and optionally exports page metadata and a data loader:

```ts
// app/pages/blog/[slug].ts

// component, html, useProps are auto-imported — no import statement needed
component('page-blog-slug', () => {
  const props = useProps({ slug: '' })

  return html`
    <div class="prose">
      <h1>${props.slug}</h1>
    </div>
  `
})

// Optional: page metadata
export const meta = {
  layout: 'default',
  middleware: ['auth'],
  hydrate: 'load',
}

// Optional: server-side data loader
export const loader = async ({ params }) => {
  const post = await fetch(`/api/posts/${params.slug}`).then(r => r.json())
  return { post }
}
```

### File → Route mapping

| File | Route |
|---|---|
| `app/pages/index.ts` | `/` |
| `app/pages/about.ts` | `/about` |
| `app/pages/blog/index.ts` | `/blog` |
| `app/pages/blog/[slug].ts` | `/blog/:slug` |
| `app/pages/[...all].ts` | `/*` |
| `app/pages/(auth)/login.ts` | `/login` (group prefix stripped) |

---

## Layouts

```ts
// app/layouts/default.ts
component('layout-default', () => {
  return html`
    <header><nav>...</nav></header>
    <main><slot></slot></main>
    <footer>...</footer>
  `
})
```

The framework wraps each route's content inside the layout declared by `meta.layout`. Defaults to `'default'` if the file exists.

---

## Server API Routes

```ts
// server/api/users/[id].ts
import type { ApiHandler } from '@jasonshimmy/vite-plugin-cer-app/types'

export const GET: ApiHandler = async (req, res) => {
  res.json({ id: req.params.id })
}

export const DELETE: ApiHandler = async (req, res) => {
  res.status(204).end()
}
```

---

## `useHead()`

```ts
import { useHead } from '@jasonshimmy/vite-plugin-cer-app/composables'

component('page-about', () => {
  useHead({
    title: 'About Us',
    meta: [
      { name: 'description', content: 'Learn more about us.' },
      { property: 'og:title', content: 'About Us' },
    ],
  })

  return html`<h1>About</h1>`
})
```

---

## Content Layer

Drop Markdown and JSON files into `content/` and query them with `queryContent()`.

Numeric ordering prefixes are supported on both directories and files. A leading `NN.` is stripped from the public content path, which lets you keep source-tree ordering without leaking the prefix into URLs:

```text
content/
  01.docs/
    01.getting-started.md   -> /docs/getting-started
    02.routing.md           -> /docs/routing
  02.blog/
    01.index.md             -> /blog
    02.2026-04-01-hello.md  -> /blog/hello
```

Date-prefixed filenames still work the same way after the numeric prefix is removed.

For content-driven routing, use `app/pages/[...all].ts` to resolve valid nested URLs at runtime. Unlike `app/pages/404.ts`, a catch-all page is not treated as a 404 automatically. Existing content routes stay HTTP 200, and in SSG with `ssg.routes: 'auto'` a catch-all page that uses `queryContent()` can auto-generate concrete output paths from the content store.

See [docs/content.md](docs/content.md) for the full content-layer API and examples.

---

## Documentation

| Guide | Description |
|---|---|
| [Getting Started](docs/getting-started.md) | Installation, scaffolding, first app |
| [Configuration](docs/configuration.md) | All `cer.config.ts` options |
| [Routing](docs/routing.md) | File-based routing, dynamic segments, route groups |
| [Layouts](docs/layouts.md) | Layout system and `<slot>` composition |
| [Components](docs/components.md) | Auto-registered custom elements |
| [Composables](docs/composables.md) | Auto-imported composables |
| [Content Layer](docs/content.md) | File-based Markdown/JSON content with `queryContent()` and `useContentSearch()` |
| [Plugins](docs/plugins.md) | App plugin system and DI |
| [Middleware](docs/middleware.md) | Route guards and server middleware |
| [Server API Routes](docs/server-api.md) | HTTP handlers in `server/api/` |
| [Data Loading](docs/data-loading.md) | Page loaders and SSR data hydration |
| [Head Management](docs/head-management.md) | `useHead()` reference |
| [Rendering Modes](docs/rendering-modes.md) | SPA, SSR, and SSG in detail |
| [CLI Reference](docs/cli.md) | `cer-app` and `create-cer-app` commands |
| [Manual Testing Guide](docs/testing.md) | How to test every feature end-to-end |

---

## License

MIT
