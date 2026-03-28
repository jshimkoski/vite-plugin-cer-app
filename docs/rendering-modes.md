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
6. The component tree is rendered to HTML with Declarative Shadow DOM via `renderToStreamWithJITCSSDSD`; the synchronous first chunk is flushed immediately, then async component swap scripts follow as they resolve
7. `useHead()` calls are collected from the synchronous render and injected before `</head>`
8. The rendered HTML is merged with the Vite client bundle shell and streamed as a chunked response

### Streaming behavior by platform

The SSR server renders in two phases: a synchronous first chunk (the full page HTML up to `</body>`) and zero or more subsequent async chunks (component swap scripts and the DSD polyfill). All platforms stream both phases to the client.

| Platform | Streaming mechanism | Notes |
|---|---|---|
| `cer-app preview` | Node.js `res.write()` → native chunked HTTP | `Transfer-Encoding: chunked` set automatically |
| Vercel | Node.js `res.write()` → native chunked HTTP | Vercel injects real `req`/`res` into the handler |
| Netlify | `TransformStream` → `Response(readableStream)` | Web Streams API; Netlify Functions v2 |
| Cloudflare Pages | `TransformStream` → `Response(readableStream)` | Web Streams API; Cloudflare Workers |

**TTFB benefit:** The browser receives the first chunk (full page HTML, including all pre-rendered content) before async swap scripts are ready. Content is visible immediately — async scripts stream in afterward without blocking the initial paint.

**Error recovery — component level:** The custom-elements runtime catches component render errors internally. If a component's render function throws, the runtime logs a warning, emits an empty DSD placeholder, and continues rendering the rest of the page. The server returns HTTP 200 with a valid HTML document; the broken component's shadow root is simply empty, and client-side hydration fills it in normally.

**Error recovery — infrastructure level:** The SSR handler also wraps the entire render and streaming loop in a `try/catch` to guard against catastrophic failures that escape the runtime's internal protection. If such an error occurs before any output has been flushed (`!res.headersSent`), the server responds with HTTP 500 and a minimal HTML error page. If it occurs mid-stream (after `res.write()` has already been called), the server calls `res.end()` to close the connection cleanly. The `endHeadCollection()` cleanup function is always called in the catch path to prevent global state leaks between concurrent requests.

**Client disconnects:** If the client closes the connection during streaming (Netlify/Cloudflare), `writer.write()` and `writer.close()` rejections are silently swallowed — the server continues handling other requests normally.

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

Per-route `meta.render` overrides are respected in the dev server: a route with `render: 'spa'` skips SSR and falls through to Vite's own asset handler (returning the SPA shell), exactly as it would in production.

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

ISR is a per-route cache layer built into the SSR server bundle. Pages with `meta.ssg.revalidate` set are rendered once, cached in memory, and re-rendered in the background when the TTL expires (stale-while-revalidate). It works identically in the preview server, on Vercel, on Netlify, and on Cloudflare Pages — no extra configuration required.

### How it works

1. **First request (HIT after fresh render):** Cache miss — render via SSR, store in memory cache with TTL, then serve from the newly-populated cache. `X-Cache: HIT` is set.
2. **Within TTL (HIT):** Serve directly from cache. `X-Cache: HIT` header is set.
3. **After TTL expires (STALE):** Serve the stale cached HTML immediately with `X-Cache: STALE`. Kick off a background re-render. When the re-render completes, update the cache.
4. **While revalidating:** Continue serving stale HTML to new requests. The in-flight revalidation is tracked as a `Promise` per path — at most one background render runs per URL at any time. Once the Promise settles (success or failure), the lock is released and the next request can trigger a fresh attempt.

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

### Query string handling

ISR caches by **path only** — query strings are stripped from the cache key. Requests to `/blog/post?preview=true` and `/blog/post` share the same cache entry. Use `render: 'server'` (no `revalidate`) for routes where query parameters affect the rendered output.

### Decision order (preview server and hosting adapters)

The built-in preview server — and the generated entry points for Vercel, Netlify, and Cloudflare — resolve each request using this precedence:

1. Static asset (`dist/client/**.*`) — served directly
2. `render: 'spa'` — returns `dist/client/index.html` (SPA shell)
3. `render: 'static'` — returns `dist/<path>/index.html`; falls back to SSR if file not found
4. `render: 'server'` — always SSR, bypasses ISR cache
5. ISR — if `meta.ssg.revalidate` is set, apply stale-while-revalidate caching
6. Regular SSR

### Compatibility with per-route render modes

ISR is controlled solely by `meta.ssg.revalidate`. The `meta.render` override is independent:

| `meta.render` | `meta.ssg.revalidate` | ISR behavior |
|---|---|---|
| _(not set)_ | set | ISR active |
| `'server'` | set | ISR active — SSR output is cached |
| `'server'` | not set | Pass-through; no caching |
| `'static'` | — | Not applicable — `render: 'static'` serves pre-rendered files, not a live SSR render |
| `'spa'` | — | Not applicable — `render: 'spa'` returns the SPA shell, not an SSR render |

> **Production note:** The `isrHandler` export in the server bundle is a pure ISR-caching wrapper around the SSR handler. It does **not** implement `render: 'spa'` or `render: 'static'` behavior — those are handled by the preview server and the SSG build pipeline. In a custom production Express setup, `render: 'spa'` routes will be SSR-rendered unless you add your own middleware to intercept them before `isrHandler`. For most SSR apps, `render: 'spa'` routes are rare; if you need them in production, serve your SPA shell explicitly for those paths.

### Availability

ISR is active everywhere the `isrHandler` from the server bundle is used:

| Environment | ISR supported |
|---|---|
| `cer-app preview` (built-in preview server) | ✅ |
| Vercel (via `cer-app adapt vercel`) | ✅ |
| Netlify (via `cer-app adapt netlify`) | ✅ |
| Cloudflare Pages (via `cer-app adapt cloudflare`) | ✅ |
| Custom Express / Node.js server | ✅ (use `isrHandler` directly) |

The in-memory ISR cache is per-process. On platforms that spin up multiple instances (Vercel, Netlify), each instance maintains its own cache — this is consistent with how Next.js and other frameworks handle ISR at the edge.

**Custom Node.js server (Express):**
```ts
import express from 'express'
import sirv from 'sirv'
import { isrHandler } from './dist/server/server.js'

const app = express()
app.use(sirv('dist/client', { dev: false }))
app.use(isrHandler)   // ISR-aware; routes without revalidate pass straight through
app.listen(3000)
```

**Production (Hono):**
```ts
import { Hono } from 'hono'
import { isrHandler } from './dist/server/server.js'

const app = new Hono()
app.use('*', isrHandler)
```

If you need to build the cache yourself, use the `createIsrHandler` utility:

```ts
import { createIsrHandler } from '@jasonshimmy/vite-plugin-cer-app/isr'
import { handler, routes } from './dist/server/server.js'

const isrHandler = createIsrHandler(routes, handler)
```

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
