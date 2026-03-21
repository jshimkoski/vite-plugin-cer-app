# Rendering Modes

Set the rendering mode in `cer.config.ts`:

```ts
export default defineConfig({
  mode: 'spa', // 'spa' | 'ssr' | 'ssg'
})
```

Or override from the CLI:

```sh
cer-app build --mode ssr
```

---

## SPA — Single-Page App

The simplest mode. Vite builds a standard client-only bundle. No server required.

### How it works

- `index.html` is the entry point with `<cer-layout-view>` as the app mount element
- All routing is client-side; the server returns the same `index.html` for every URL
- `virtual:cer-routes` injects all routes into the client-side router

### Build output

```
dist/
  index.html
  assets/
    app-[hash].js
    app-[hash].css
```

### Configuration

```ts
export default defineConfig({ mode: 'spa' })
```

### Dev server

Standard Vite HMR. No SSR middleware involved.

### Deploy

Any static host (Netlify, Vercel, GitHub Pages, S3). Configure the host to serve `index.html` for all 404s (SPA fallback).

---

## SSR — Server-Side Rendering

The server renders HTML for each request. Uses Declarative Shadow DOM (DSD) to eliminate FOUC.

### How it works

1. A request arrives
2. Server middleware runs (CORS, auth, etc.)
3. API route handlers run if the URL matches `/api/`
4. For HTML requests, the router matches the URL to a page
5. The page's `loader` is called (if present)
6. The component tree is rendered to HTML with Declarative Shadow DOM via `renderToStringWithJITCSSDSD`
7. `useHead()` calls are collected and injected before `</head>`
8. The rendered HTML is merged with the Vite client bundle shell and sent as a full response

### Build output

```
dist/
  client/                        # served as static files
    index.html
    assets/
      app-[hash].js
  server/
    server.js                    # Node.js request handler
```

`server.js` exports:

```ts
export const handler: (req, res) => void  // main request handler
export { apiRoutes, plugins, layouts }
export default handler
```

### Configuration

```ts
export default defineConfig({
  mode: 'ssr',
})
```

### Dev server

The Vite dev server intercepts HTML requests and runs the SSR render inline using `server.ssrLoadModule`. No separate server process is needed during development.

Any request that:
- Has `Accept: text/html`
- Is to `/`
- Has no file extension and does not start with `/api/`

…is treated as an HTML request and rendered server-side.

### Integrating with Express / Fastify / Hono

In production, wire the server bundle's handler into your web framework:

**Express:**
```ts
import express from 'express'
import { handler } from './dist/server/server.js'
import { createServer as createViteServer } from 'vite'
import sirv from 'sirv'

const app = express()

// Serve static assets from dist/client
app.use(sirv('dist/client', { dev: false }))

// SSR handler for everything else
app.use(handler)

app.listen(3000)
```

**Hono:**
```ts
import { Hono } from 'hono'
import { handler } from './dist/server/server.js'

const app = new Hono()
app.use('*', handler)
```

### Deploy

Any Node.js server or edge runtime that can import the server bundle. The handler is an Express-compatible `(req, res) => void` function.

---

## SSG — Static Site Generation

All routes are rendered to static HTML at build time. No server required at runtime.

### How it works

1. The SSR build runs first (produces `dist/client/` and `dist/server/server.js`)
2. Routes are enumerated (auto-scan or explicit list)
3. Each route is rendered using `server.js`
4. HTML files are written to `dist/<path>/index.html`
5. A `ssg-manifest.json` is written with the list of generated pages and any errors

### Build output

```
dist/
  index.html              # /
  about/
    index.html            # /about
  blog/
    hello-world/
      index.html          # /blog/hello-world
    second-post/
      index.html          # /blog/second-post
  client/                 # static assets
    assets/
      app-[hash].js
  server/                 # intermediate SSR bundle (can be deleted after SSG)
    server.js
  ssg-manifest.json       # build report
```

### Configuration

```ts
export default defineConfig({
  mode: 'ssg',
  ssg: {
    routes: 'auto',    // or explicit: ['/about', '/blog/hello-world']
    concurrency: 4,    // parallel renders
    fallback: false,   // serve 404 for unenumerated routes
  },
})
```

### Dynamic routes

For dynamic routes (`[slug].ts`), export `meta.ssg.paths` to enumerate all paths that should be pre-rendered:

```ts
export const meta = {
  ssg: {
    paths: async () => {
      const posts = await fetchAllPosts()
      return posts.map(p => ({ params: { slug: p.slug } }))
    },
  },
}
```

Dynamic routes without `ssg.paths` are skipped during SSG. If `ssg.fallback: true`, they fall back to SSR at runtime. Otherwise they return 404.

### SSG manifest

```json
{
  "generatedAt": "2025-01-01T00:00:00.000Z",
  "paths": ["/", "/about", "/blog/hello-world"],
  "errors": []
}
```

Errors are per-path; a single failed path does not abort the rest of the build.

### Deploy

Any CDN or static host. Upload the entire `dist/` directory (excluding `dist/server/` if not needed).

---

## ISR — Incremental Static Regeneration

ISR is a per-route cache layer in the SSR preview server. Pages with `meta.ssg.revalidate` set are rendered once, cached, and re-rendered in the background when the TTL expires (stale-while-revalidate).

### How it works

1. **First request (HIT after fresh render):** Cache miss — render via SSR, store in memory cache with TTL, then serve from the newly-populated cache. `X-Cache: HIT` is set.
2. **Within TTL (HIT):** Serve directly from cache. `X-Cache: HIT` header is set.
3. **After TTL expires (STALE):** Serve the stale cached HTML immediately with `X-Cache: STALE`. Kick off a background re-render. When the re-render completes, update the cache.
4. **While revalidating:** Continue serving stale HTML to new requests.

### Configuration

Add `revalidate` (seconds) to `meta.ssg` in any page:

```ts
// app/pages/blog/[slug].ts
export const meta = {
  ssg: {
    revalidate: 60,   // cache for 60 s; re-render in background after expiry
    paths: async () => {
      const posts = await fetchPosts()
      return posts.map(p => ({ params: { slug: p.slug } }))
    },
  },
}
```

### Use cases

| TTL | Use case |
|---|---|
| `revalidate: 0` | TTL expires immediately — first request is HIT; every subsequent request is STALE with a background re-render |
| `revalidate: 60` | News articles, dashboards |
| `revalidate: 3600` | Product pages, documentation |
| `revalidate: 86400` | Marketing pages, rarely-changing content |

### Availability

ISR is currently active in the built-in **preview server** (`cer-app preview`). When integrating the server bundle into Express / Hono / Fastify in production, implement the same stale-while-revalidate pattern using `route.meta?.ssg?.revalidate` from the exported `routes` array.

---

## Comparing modes

| Feature | SPA | SSR | SSG | ISR |
|---|---|---|---|---|
| Initial HTML | Empty shell | Full HTML | Full HTML | Full HTML |
| SEO | Poor | Excellent | Excellent | Excellent |
| TTFB | Fast | Depends on server | Very fast (CDN) | Very fast after first render |
| Server required | No | Yes | No | Yes |
| Data freshness | Real-time | Real-time | Build-time | Configurable TTL |
| Dynamic routes | Yes | Yes | Requires `ssg.paths` | Yes |
| API routes | Separate deploy | Same process | Separate deploy | Same process |

---

## Switching modes

Modes are selected at build time, not at runtime. To change mode, update `cer.config.ts` and rebuild. All three modes share the same source code — pages, layouts, components, and composables work identically across modes.
