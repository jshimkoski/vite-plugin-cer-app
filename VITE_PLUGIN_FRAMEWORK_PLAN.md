# Vite Plugin Framework Plan: `vite-plugin-cer-app`

A Nuxt/Next.js-style meta-framework built on top of `@jasonshimmy/custom-elements-runtime`.

---

## Library Audit Summary

### What the library already provides

| Capability | Status | Details |
|---|---|---|
| Reactivity (`ref`, `computed`, `watch`) | ✅ Full | Complete reactive system |
| SSR (DSD, streaming, hydration strategies) | ✅ Full | `renderToString*`, `renderToStream`, per-component `hydrate` |
| Client-side routing | ✅ Partial | Manual `useRouter()` config — **no file-based routing** |
| Component composition (hooks, provide/inject) | ✅ Full | React-style API |
| JIT CSS + Shadow DOM styling | ✅ Full | Tailwind-compatible, build-time via `cerPlugin` |
| SSR middleware adapters (Express/Fastify/Hono) | ✅ Full | `createSSRHandler`, `createStreamingSSRHandler` |
| Existing Vite plugin infrastructure | ✅ Full | `cerPlugin`, `cerJITCSS`, virtual modules |
| Global state + event bus | ✅ Partial | `createStore`, `GlobalEventBus` — no devtools/middleware |
| Error boundaries + suspense | ✅ Partial | Component-level only — no global 404 handler |
| TypeScript | ✅ Full | Strict mode, complete type coverage |

### Gaps requiring framework-layer solutions

| Gap | Impact | Framework Solution |
|---|---|---|
| No file-based routing | High | Glob `pages/` at build time, auto-generate `Route[]` |
| No layout system | High | `layouts/` directory convention + `<cer-keep-alive>` |
| No data loaders | High | Route-level `loader` export + SSR→client serialization |
| No auto-imports | Medium | Vite plugin: resolve `component`, `html`, hooks automatically |
| No API/server routes | High | Glob `server/api/` and register handlers on dev server |
| No meta/head management | Medium | `useHead()` composable wrapping document title/meta |
| No static generation (SSG) | High | Crawl routes at build, call `renderToString*` per route |
| No global middleware | Medium | Plugin-level `onBeforeRender`/`onAfterRender` hooks |
| No plugin runtime system | Medium | `defineAppPlugin` convention loaded from `plugins/` dir |
| No CLI tooling | Medium | `cer-app` CLI wrapping Vite dev/build commands |

### Verdict

> **The library can support this.** Its SSR pipeline, streaming renderer, router, composable system, and existing Vite plugin are all strong foundations. Every gap is a build-time or thin runtime addition — none require patching library internals.

---

## Plugin Overview

**Package name:** `vite-plugin-cer-app`

The plugin transforms any Vite project into a full-stack application framework by:

1. Scanning conventional directories at build time
2. Auto-generating virtual modules for routes, layouts, middleware, plugins, and API handlers
3. Orchestrating dev server (SSR middleware + HMR) and production build (SPA / SSR / SSG)

---

## Directory Convention

Follows Nuxt 4's layout: client-side app code lives under `app/`, server code at the root.

```
my-app/
├── app/
│   ├── app.ts              # App bootstrap (optional — auto-generated if absent)
│   ├── pages/
│   │   ├── index.ts        # → /
│   │   ├── about.ts        # → /about
│   │   ├── blog/
│   │   │   ├── index.ts    # → /blog
│   │   │   └── [slug].ts   # → /blog/:slug
│   │   └── [...catchAll].ts  # → /* (catch-all / 404)
│   ├── layouts/
│   │   ├── default.ts      # Default layout (wraps pages without layout: '...')
│   │   └── minimal.ts      # Named layout
│   ├── components/         # Auto-imported custom elements
│   │   └── ui/
│   │       └── my-button.ts  # → <my-button> auto-registered
│   ├── composables/        # Auto-imported composables
│   │   └── useTheme.ts
│   ├── plugins/            # App plugins loaded before render
│   │   └── 01.store.ts     # Numbered prefix → load order
│   └── middleware/         # Global route middleware
│       └── auth.ts
├── server/
│   ├── api/
│   │   ├── users/
│   │   │   ├── index.ts    # GET/POST /api/users
│   │   │   └── [id].ts     # GET/PUT/DELETE /api/users/:id
│   │   └── health.ts       # GET /api/health
│   └── middleware/         # Server-only middleware (CORS, auth, etc.)
│       └── cors.ts
├── public/                 # Copied as-is to dist/
│   └── favicon.ico
└── cer.config.ts           # Framework config file
```

---

## Configuration File (`cer.config.ts`)

```typescript
import { defineConfig } from 'vite-plugin-cer-app';

export default defineConfig({
  // Rendering mode
  mode: 'ssr',             // 'spa' | 'ssr' | 'ssg'

  // SSG options (only used in 'ssg' mode)
  ssg: {
    routes: 'auto',        // 'auto' | string[] — crawl or explicit list
    concurrency: 4,        // Pages rendered in parallel
  },

  // Router options (passed to useRouter())
  router: {
    base: '/',
    scrollToFragment: { enabled: true, offset: 0 },
  },

  // JIT CSS options (passed to cerPlugin())
  jitCss: {
    content: ['./app/pages/**/*.ts', './app/components/**/*.ts', './app/layouts/**/*.ts'],
    extendedColors: false,
  },

  // SSR render options (passed to renderToString*())
  ssr: {
    dsd: true,
    streaming: false,
  },

  // Auto-import namespaces
  autoImports: {
    components: true,       // Auto-register components/ as custom elements
    composables: true,      // Auto-import composables/ as named exports
    directives: true,       // Auto-import `when`, `each`, `match` etc.
    runtime: true,          // Auto-import `component`, `html`, `ref`, etc.
  },

  // Vite dev server port
  port: 3000,
});
```

---

## Virtual Modules

The plugin resolves these virtual module IDs at build and dev time:

| Virtual ID | Contents |
|---|---|
| `virtual:cer-routes` | Auto-generated `Route[]` from `app/pages/` |
| `virtual:cer-layouts` | Map of layout name → layout component from `app/layouts/` |
| `virtual:cer-components` | Auto-registration calls for `app/components/` |
| `virtual:cer-composables` | Re-export barrel for `app/composables/` |
| `virtual:cer-plugins` | Sorted `app/plugins/` list for sequential loading |
| `virtual:cer-middleware` | Global middleware chain from `app/middleware/` |
| `virtual:cer-server-api` | API route map from `server/api/` for dev server + SSR |
| `virtual:cer-app-config` | Resolved `cer.config.ts` for runtime |

---

## Page Convention

Every file in `app/pages/` exports a `component()` definition. Optional metadata exports customize behavior:

```typescript
// app/pages/blog/[slug].ts

import { component, html, ref, useProps } from '@jasonshimmy/custom-elements-runtime';
import type { PageMeta, PageLoader } from 'vite-plugin-cer-app/types';

// Required: define the custom element
component('page-blog-slug', () => {
  const props = useProps({ slug: '' });

  return html`
    <div class="prose">
      <h1>${props.slug}</h1>
    </div>
  `;
});

// Optional: page-level metadata
export const meta: PageMeta = {
  layout: 'default',          // Which layout to use (default: 'default')
  middleware: ['auth'],        // Named middleware to run before this page
  hydrate: 'load',            // Per-page hydration strategy
  ssg: {
    paths: async () => [      // SSG dynamic path generation
      { params: { slug: 'hello-world' } },
      { params: { slug: 'second-post' } },
    ],
  },
};

// Optional: server-side data loader
export const loader: PageLoader = async (ctx) => {
  const { params, req } = ctx;
  const post = await fetch(`/api/posts/${params.slug}`).then(r => r.json());
  return { post };             // Serialized → injected as props on the page element
};
```

### File → Route Mapping

| File | Route Path |
|---|---|
| `app/pages/index.ts` | `/` |
| `app/pages/about.ts` | `/about` |
| `app/pages/blog/index.ts` | `/blog` |
| `app/pages/blog/[slug].ts` | `/blog/:slug` |
| `app/pages/[...all].ts` | `/*` (catch-all) |
| `app/pages/(auth)/login.ts` | `/login` (parenthesized = route group, no path prefix) |

---

## Layout Convention

```typescript
// app/layouts/default.ts

import { component, html } from '@jasonshimmy/custom-elements-runtime';

component('layout-default', () => {
  return html`
    <app-header></app-header>
    <main>
      <slot></slot>      <!-- page content renders here -->
    </main>
    <app-footer></app-footer>
  `;
});
```

The framework wraps each `<router-view>` output inside the layout declared in `meta.layout`. Layout switching is handled through `<cer-keep-alive>` to preserve DOM state on navigation.

---

## Server API Routes

```typescript
// server/api/users/[id].ts   (server/ stays at project root, not inside app/)

import type { ApiHandler } from 'vite-plugin-cer-app/types';

// Named exports per HTTP method
export const GET: ApiHandler = async (req, res) => {
  const user = await db.user.findOne(req.params.id);
  res.json(user);
};

export const PUT: ApiHandler = async (req, res) => {
  const updated = await db.user.update(req.params.id, req.body);
  res.json(updated);
};

export const DELETE: ApiHandler = async (req, res) => {
  await db.user.delete(req.params.id);
  res.status(204).end();
};
```

API routes are registered:
- **Dev mode**: As Vite dev server middleware
- **SSR mode**: As route handlers in the generated server entry
- **SPA mode**: As Vite preview server middleware (or deployed separately)
- **SSG mode**: Optionally called at build time to generate JSON data files

---

## Server Middleware

```typescript
// server/middleware/cors.ts   (server/ stays at project root, not inside app/)

import type { ServerMiddleware } from 'vite-plugin-cer-app/types';

const cors: ServerMiddleware = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
};

export default cors;
```

---

## Global Route Middleware

```typescript
// app/middleware/auth.ts

import type { RouteMiddleware } from 'vite-plugin-cer-app/types';

const auth: RouteMiddleware = async (to, from, next) => {
  const session = await getSession();
  if (!session) {
    next('/login');
  } else {
    next();
  }
};

export default auth;
```

Global middleware runs before every route. Named middleware (referenced in `meta.middleware`) runs only for the matching page.

---

## App Plugins

```typescript
// app/plugins/01.store.ts

import type { AppPlugin } from 'vite-plugin-cer-app/types';
import { createStore } from '@jasonshimmy/custom-elements-runtime/store';

export default {
  name: 'app-store',
  setup(app) {
    const store = createStore({ user: null, theme: 'light' });
    app.provide('store', store);
  },
} satisfies AppPlugin;
```

Plugins are loaded in filename order (numeric prefix recommended). They receive an `app` context with `provide` for DI and `router` for guard registration.

---

## `useHead()` Composable

Built into the framework runtime, not the library:

```typescript
import { useHead } from 'vite-plugin-cer-app/composables';

component('page-about', () => {
  useHead({
    title: 'About Us',
    meta: [
      { name: 'description', content: 'Learn more about our team.' },
      { property: 'og:title', content: 'About Us' },
    ],
    link: [
      { rel: 'canonical', href: 'https://example.com/about' },
    ],
  });

  return html`<h1>About</h1>`;
});
```

In SSR mode, `useHead()` calls are collected during `renderToString*` and injected into the `<head>` of the HTML shell. In client mode, they imperatively update `document.title` / meta tags.

---

## Data Loading & Hydration

The page `loader` export solves the SSR→client data hydration problem:

### SSR Flow
1. Server receives request for `/blog/hello-world`
2. Plugin matches route → finds `app/pages/blog/[slug].ts`
3. Calls `loader({ params: { slug: 'hello-world' }, req })`
4. Serializes return value as `window.__CER_DATA__` in HTML `<script>`
5. Calls `renderToStringWithJITCSSDSD(html`<page-blog-slug slug="hello-world" post="...">`)`
6. Streams or sends full HTML

### Client Hydration Flow
1. Browser receives full HTML (DSD means zero FOUC)
2. Runtime reads `window.__CER_DATA__` and passes it as props / injected context
3. Components attach to pre-rendered DOM — no refetch required

---

## Rendering Modes

### SPA Mode (`mode: 'spa'`)

- Vite builds a standard client-only bundle
- `index.html` shell with `<div id="app">` replaced by `<app-root>`
- `virtual:cer-routes` injects all routes into client-side router
- No SSR, no server entry
- Dev: standard Vite HMR
- Build output: `dist/` with `index.html` + assets

### SSR Mode (`mode: 'ssr'`)

- Generates a **server entry** (`dist/server/entry.js`) + **client entry** (`dist/client/`)
- Server entry exports a `handler(req, res)` using `createStreamingSSRHandler`
- Automatically wires: page matching → layout wrapping → data loading → `renderToStream`
- Compatible with Node.js servers (Express, Fastify, Hono) and edge runtimes
- Vite SSR build handles `ssr: true` correctly for server bundle
- Dev: Vite dev server with `transformIndexHtml` and SSR middleware

### SSG Mode (`mode: 'ssg'`)

- Runs SSR render for every route at build time
- Dynamic routes: calls `meta.ssg.paths()` per page to enumerate paths
- Writes each route to `dist/<path>/index.html`
- API routes that are `loader`-only can be inlined as JSON or omitted
- Uses `renderToStringWithJITCSSDSD` for DSD output with embedded CSS
- Falls back to SSR for routes not enumerated at build time (optional)

---

## Implementation Phases

### Phase 1 — Core Plugin Infrastructure ✅ Complete

**Goal**: Get a basic SPA working with file-based routing.

- [x] Scaffold `vite-plugin-cer-app` package with `definePlugin`, `defineConfig`
- [x] Resolve `app/` directory relative to project root (configurable via `srcDir` option)
- [x] Implement `app/pages/` scanner → generate `virtual:cer-routes` as `Route[]`
- [x] File-name → route-path transformer (index, dynamic `[param]`, catch-all `[...rest]`)
- [x] Route group support `(groupName)/` (path prefix stripped)
- [x] Auto-register `app/components/` via `virtual:cer-components`
- [x] Auto-import `app/composables/` via `virtual:cer-composables`
- [x] Auto-import runtime API (`component`, `html`, `ref`, etc.) — no manual imports required
- [x] Generate `app/app.ts` entry if absent: bootstrap, register built-ins, init router
- [x] SPA build mode: output `index.html` with `<router-view>` + bundled assets
- [x] Include `@jasonshimmy/custom-elements-runtime/css` (CSS variables + reset) by default
- [x] Mount `createDOMJITCSS()` automatically for light-DOM JIT CSS in browser

---

### Phase 2 — Layouts + Metadata ⚠️ Partial

**Goal**: Layout system and per-page metadata work end-to-end.

- [x] `app/layouts/` scanner → `virtual:cer-layouts` map (registers layout custom elements)
- [ ] Layout wrapper: detect `meta.layout` from matched page, wrap `<router-view>` output in the layout element
- [ ] `<cer-keep-alive>` integration to preserve layout DOM between navigations
- [x] `meta` export type + validation (TypeScript) — `PageMeta` type exported
- [x] `useHead()` composable — client-side: imperatively updates DOM; SSR: collects into array
- [x] Head injection in HTML shell during SSR / SSG — `beginHeadCollection`/`endHeadCollection` + `serializeHeadTags`

**Note**: Layouts are registered and their tag names are exported via `virtual:cer-layouts`, but the layout-wrapping logic (reading `meta.layout` and wrapping the page component in the layout element) is not yet wired into `router-view` or the server entry.

---

### Phase 3 — SSR Mode ✅ Complete

**Goal**: Full server-side rendering with DSD, streaming, and data loading.

- [x] SSR-mode Vite config: dual build (client + server bundles via `buildSSR`)
- [x] Server entry generator: auto-generated in `build-ssr.ts` with concurrent-safe per-request router threading
- [x] `loader` export detection + type (`PageLoader<Params, Data>`) — types defined, detection in routes
- [x] Streaming SSR: `createStreamingSSRHandler` with `{ vnode, router }` factory — concurrent-safe
- [x] Dev server middleware: intercepts HTML requests, loads `entry-server.ts` via `ssrLoadModule`
- [x] 404 page: `app/pages/[...all].ts` catch-all convention supported
- [ ] SSR data serialization: `window.__CER_DATA__` injection (loader data not yet serialized to HTML)
- [ ] Client-side data rehydration: read `__CER_DATA__` and pass as props before hydration

---

### Phase 4 — Server API Routes ✅ Complete

**Goal**: `server/api/` routes work in dev, SSR, and SSG.

- [x] `server/api/` scanner → `virtual:cer-server-api` route map
- [x] File-name → API path transformer (same rules as pages, under `/api/`)
- [x] HTTP method export detection (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`)
- [x] Dev: API routes registered as `configureServer` middleware
- [x] SSR: API route handlers included in server entry
- [x] `server/middleware/` scanner → `virtual:cer-server-middleware`, applied before API routes
- [x] Request/response helpers: `req.params`, `req.query`, `req.body`, `res.json()`, `res.status()`
- [x] Error handling: uncaught errors → `{ error: 'Internal Server Error' }` JSON with 500

---

### Phase 5 — Global Middleware + Plugins ✅ Complete

**Goal**: Auth guards, plugins, and DI work across the app.

- [x] `app/middleware/` scanner → `virtual:cer-middleware`
- [x] Middleware chain integration into router `beforeEnter` guard via `virtual:cer-middleware`
- [x] `meta.middleware` named middleware resolution (supported in `virtual:cer-routes`)
- [x] `app/plugins/` scanner → sorted `virtual:cer-plugins` (numeric prefix → alphabetical)
- [x] `AppPlugin` interface + `app` context (`provide`, `router`, `config`)
- [x] Plugin load order: numeric prefix sorts first, then alphabetical

---

### Phase 6 — SSG Mode ✅ Complete

**Goal**: Static site generation with dynamic route enumeration.

- [x] SSG build: runs SSR render per route, writes `dist/<path>/index.html`
- [x] `meta.ssg.paths()` enumeration for dynamic routes
- [x] Concurrency limit (`ssg.concurrency`, default 4) with `Promise.allSettled` — concurrent-safe via per-request router threading
- [x] Automatic route crawling from `app/pages/` (static routes auto-discovered, `ssg.routes: 'auto'`)
- [x] Build manifest: `ssg-manifest.json` with generated pages + any per-page errors
- [ ] API routes called at build → output JSON to `dist/api/<route>/index.json` (opt-in)
- [ ] ISR-style: fallback to SSR for unenumerated routes (opt-in, `ssg.fallback` config exists but not implemented)

---

### Phase 7 — CLI Tooling ✅ Complete

**Goal**: `npx create-cer-app` and `cer-app dev/build/preview` commands.

- [x] `create-cer-app`: scaffold from template with mode selection (SPA / SSR / SSG)
- [x] `cer-app dev`: wraps `vite dev` with SSR middleware attached
- [x] `cer-app build`: builds in correct mode (SPA / SSR dual-build / SSG)
- [x] `cer-app preview`: serves `dist/` with SSR handler or static files
- [x] `cer-app generate`: explicit SSG crawl + render (alias for build in SSG mode)
- [ ] TypeScript config auto-setup: path aliases for `~/pages`, `~/components`, `~/composables`

---

## Technical Architecture

```
vite-plugin-cer-app/
├── src/
│   ├── plugin/
│   │   ├── index.ts            # Main Vite plugin factory
│   │   ├── scanner.ts          # Directory watchers — scans app/ and server/ separately
│   │   ├── virtual/
│   │   │   ├── routes.ts       # virtual:cer-routes — scans app/pages/
│   │   │   ├── layouts.ts      # virtual:cer-layouts — scans app/layouts/
│   │   │   ├── components.ts   # virtual:cer-components — scans app/components/
│   │   │   ├── composables.ts  # virtual:cer-composables — scans app/composables/
│   │   │   ├── plugins.ts      # virtual:cer-plugins — scans app/plugins/
│   │   │   ├── middleware.ts   # virtual:cer-middleware — scans app/middleware/
│   │   │   └── server-api.ts   # virtual:cer-server-api — scans server/api/ (root)
│   │   ├── transforms/
│   │   │   ├── auto-import.ts  # Auto-import injection into page/component files
│   │   │   └── head-inject.ts  # <head> injection for SSR/SSG HTML output
│   │   ├── dev-server.ts       # Vite configureServer — SSR middleware + API routes
│   │   ├── build-ssr.ts        # Dual-build orchestration (client + server)
│   │   └── build-ssg.ts        # SSG route crawling + render loop
│   ├── runtime/
│   │   ├── composables/
│   │   │   └── useHead.ts      # Head management composable
│   │   ├── app.ts              # App bootstrap template (placed in app/)
│   │   ├── entry-client.ts     # Client entry template
│   │   └── entry-server.ts     # Server entry template
│   ├── types/
│   │   ├── page.ts             # PageMeta, PageLoader
│   │   ├── api.ts              # ApiHandler, ApiContext
│   │   ├── plugin.ts           # AppPlugin
│   │   ├── middleware.ts       # RouteMiddleware, ServerMiddleware
│   │   └── config.ts           # CerAppConfig, defineConfig (includes srcDir option)
│   └── cli/
│       ├── index.ts            # CLI entrypoint
│       ├── commands/
│       │   ├── dev.ts
│       │   ├── build.ts
│       │   ├── preview.ts
│       │   └── generate.ts
│       └── create/
│           └── templates/      # Project scaffolding templates
│               ├── spa/
│               ├── ssr/
│               └── ssg/
└── package.json
```

---

## Dependency Map

```
vite-plugin-cer-app
├── @jasonshimmy/custom-elements-runtime   (peer — all rendering, reactivity, routing)
├── vite                                   (peer — plugin host, build, dev server)
├── fast-glob                              (file scanning for pages/, components/, etc.)
├── chokidar                               (HMR: watch for added/removed route files)
├── magic-string                           (AST-free code transforms for auto-import)
└── pathe                                  (cross-platform path utilities)
```

No heavy dependencies. Everything rendering-related delegates to the runtime library.

---

## Known Risks & Mitigations

| Risk | Mitigation |
|---|---|
| HMR breaks when pages added/removed | Use `chokidar` in `configureServer`; invalidate virtual modules on change |
| Data loader props exceed URL-safe attribute limits | Serialize into `<script type="application/json" id="__cer-data">` inside shadow root |
| SSG misses dynamic routes | Warn + list unresolved routes; require explicit `ssg.paths()` for dynamic segments |
| Circular dependency between auto-imported composables | Document that composables must be side-effect-free at import time |
| SSR streaming + head injection timing | Collect `useHead()` calls in a pre-render pass, then stream body |
| Router `activeRouterProxy` race during SSR | Use `initialUrl` per-request (library already supports this) |
| Edge runtime compatibility | Ensure server entry uses only Web APIs; no Node.js-specific code paths |
