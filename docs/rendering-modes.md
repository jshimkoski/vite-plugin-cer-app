# Rendering modes

Choose `mode: 'spa' | 'ssr' | 'ssg'` in `cer.config.ts`, or override it with `cer-app build --mode ssr`. Rebuild when changing mode. Pages and composables share source across modes, but loaders execute in different environments; see [data loading](./data-loading.md).

## SPA

Vite builds a client application in `dist/index.html` and `dist/assets/`. Routing and initial loaders run in the browser. There is no CER server bundle, middleware or API runtime in this output. Deploy to a static host with an `index.html` fallback for application URLs; deploy APIs separately. Development uses Vite and HMR.

## SSR

The build produces `dist/client/` for public assets and `dist/server/server.js` for request handling. Middleware runs before APIs and document routing. The matched page loader is awaited before rendering. CER renders declarative shadow DOM and streams HTML, followed by async component updates. Head information from the synchronous render is inserted into the document head.

Ordinary SSR responses stream through Node responses in preview/Vercel and Web Streams in Netlify/Cloudflare. The Web bridges resolve the Response on the first header/body write, rather than waiting for `end()`. HTTP/1.1 can use chunked transfer; HTTP/2 uses its own framing. Loader latency still delays the first HTML, and platform/proxy buffering can affect delivery. ISR cache misses buffer a complete render before responding.

A component error can produce an error boundary or empty placeholder while the document still returns 200. Hydration cannot guarantee that a broken component recovers. An infrastructure error before headers produces a controlled 500; after output starts, the handler closes the response. Web bridge cancellation closes the producer. These protections do not make a failing page a successful build or a correct user experience; check logs and rendered content.

The server bundle exports `handler` (SSR rendering), `spaHandler`, `isrHandler`, `dispatchRequest` (middleware, APIs and document decisions), and `createDispatchRequest(options)` (the same dispatch with a prerendered-document provider), as well as route/plugin/layout metadata. Prefer `dispatchRequest` for custom Node hosting:

```ts
import express from 'express'
import { dispatchRequest } from './dist/server/server.js'

const app = express()
app.use(express.static('dist/client', { index: false }))
app.use(dispatchRequest)
app.listen(3000)
```

Static assets are served before CER document middleware in this example and in the adapters. Keep confidential resources outside public asset directories. Fastify integrations need to pass the raw Node request/response and prevent Fastify from sending another response. Hono and other Web Request/Response frameworks need a transport bridge; a Node handler cannot be passed directly to `app.use()`.

SSR development runs through Vite's module loader and respects per-route render modes. Built preview is the test of production bundle behavior; it is not a production hosting server.

## SSG and hybrid builds

SSG first builds the SSR/client bundles, enumerates routes, then renders documents to `dist/<path>/index.html`. Pure static output normally prunes the intermediate server/client directories and places assets at their public URLs. A server remains necessary for APIs, server middleware, ISR, `render: 'server'`, `render: 'spa'` in a hybrid build, or `ssg.fallback: true`. `ssg.keepServer: true` also retains the intermediate bundle for custom consumers, without by itself turning a pure static site into a dynamic deployment.

```ts
export default defineConfig({
  mode: 'ssg',
  ssg: { routes: 'auto', concurrency: 4, fallback: false },
})
```

For dynamic pages, enumerate concrete routes with `meta.ssg.paths`:

```ts
export const meta = {
  ssg: {
    paths: async () => (await fetchPosts()).map(post => ({ params: { slug: post.slug } })),
  },
}
```

Unenumerated dynamic routes are skipped. The content layer can auto-enumerate content catch-all paths when `ssg.routes` is `'auto'`. With fallback enabled, missing documents can render on the server; otherwise ordinary ungenerated static URLs return 404. Always-server, SPA and ISR routes retain their explicit runtime behavior.

`ssg-manifest.json` records `paths`, `errors`, `generatedAt`, `fallback` and `hybrid`. Rendering continues across per-path errors to collect a complete report, then the command fails by default if errors occurred. `ssg.failOnError: false` deliberately permits partial output. Component errors swallowed by a component boundary may not become manifest errors; inspect the actual HTML too.

Use the deployment adapters to separate public output from private build files. A custom static deployment should publish generated documents, public assets and generated metadata, excluding `server/`, `client/`, `.vite/` and CER build manifests. Hybrid deployments must also install a server entrypoint and a prerendered-document provider; copying HTML to a public CDN alone bypasses document middleware.

## ISR

Declare `meta.ssg.revalidate` in seconds to cache eligible anonymous documents. This is an in-memory, per-dispatcher/process cache, bounded to 1,000 documents. Instances do not share storage; restarts and cold starts lose it. It is not a durable platform ISR service.

1. A cold request renders and buffers the complete document, then responds with `X-Cache: HIT` if eligible, or `BYPASS` if the rendered response cannot be shared. Identical cold requests can share an in-flight render.
2. Within the TTL, the cached document returns `X-Cache: HIT`.
3. After expiry, stale HTML returns immediately with `X-Cache: STALE` and one background re-render per path updates the cache. Failed renders can be retried later.

`revalidate: 0` expires immediately. A cache render has a 30-second capture deadline; on failure/timeout the request falls back to ordinary SSR. This is not a deadline for the fallback render. Background refresh runs in the current process; serverless platforms may suspend it after the response. Do not rely on its completion for strict freshness. Use always-server rendering where freshness is essential.

Query strings, cookies, Authorization and non-GET requests bypass caching. `render: 'server'` always bypasses, even if a TTL is declared. Middleware or render responses with Set-Cookie, private/no-store Cache-Control, or Vary keys other than Accept-Encoding cannot populate the shared cache; non-200 responses cannot populate it either. Handlers whose output depends on other headers must declare appropriate Vary/private caching policy.

## Shared document decisions

Built preview and generated server adapters use a shared dispatcher. Existing public assets are handled by the static transport. For document/API requests, the dispatcher blocks private/malformed build URLs, runs middleware, then:

1. Dispatches `/api/` handlers (including GET fallback for HEAD).
2. Returns the SPA shell for a matching `render: 'spa'` page.
3. Always renders `render: 'server'` pages.
4. Uses eligible ISR for routes with a revalidation TTL.
5. Serves known prerendered documents for GET/HEAD through the transport's document provider.
6. Uses SSR fallback, or a real 404 for ungenerated ordinary static routes when SSG fallback is disabled.

API bodies have a 1 MiB parsing limit; malformed JSON/parameters return 400, oversized bodies 413 and unsupported methods 405. HEAD responses have no body on Node transports and Web bridges.

`isrHandler` alone wraps SSR; it does not provide middleware/API/SPA/static decisions. Custom hybrid hosts can use `createDispatchRequest({ prerendered: { paths, read, fallback, notFound } })`; `read(path, req)` returns document HTML or null. Keep the provider private and enforce the same public/private file separation as the adapters.

Adapters are selected with `cer-app adapt --platform vercel`, `--platform netlify` or `--platform cloudflare`. Rebuild before switching adapters because Cloudflare transforms the build output. See [CLI/deployment](./cli.md) for platform requirements and [production checks](./production-content.md) for validation.

## Choosing a mode

| Behavior | SPA | SSR | Pure SSG | ISR/hybrid |
|---|---|---|---|---|
| Initial document | App shell | Rendered HTML | Build-time HTML | Rendered/cached HTML |
| Runtime server | Separate APIs only | Required | None | Required |
| Initial loader | Browser | Server | Build | Server on cache miss |
| Client navigation loader | Browser | Browser | Browser | Browser |
| Freshness on direct load | Browser fetch | Per request | Rebuild | TTL/process lifetime |
| Dynamic route enumeration | Unnecessary | Unnecessary | Required, with content convenience | Depends on static/fallback policy |

Good SEO, accessibility and Lighthouse scores depend on the application's content, metadata, media and interactions in every mode. The rendering mode alone does not guarantee them.
