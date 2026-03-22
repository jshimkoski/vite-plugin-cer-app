# CLI Reference

The framework provides two CLI programs:

- **`cer-app`** — dev server, build, preview, and generate commands
- **`create-cer-app`** — project scaffolding

Both are available after installing `@jasonshimmy/vite-plugin-cer-app` as a dev dependency, or globally:

```sh
npm install -g @jasonshimmy/vite-plugin-cer-app
```

---

## `cer-app`

### `cer-app dev`

Starts the Vite development server. Reads `cer.config.ts` from the current directory.

```sh
cer-app dev [options]
```

| Option | Default | Description |
|---|---|---|
| `-p, --port <port>` | `3000` | Port to listen on |
| `--host <host>` | `localhost` | Host to bind to |
| `--root <root>` | `process.cwd()` | Project root directory |

**Examples:**

```sh
cer-app dev
cer-app dev --port 4000
cer-app dev --host 0.0.0.0 --port 8080
cer-app dev --root ./packages/my-app
```

**Behavior:**

- Loads and transpiles `cer.config.ts` (or `cer.config.js`)
- Starts the Vite dev server with `cerApp()` plugins applied
- In SSR mode: intercepts HTML requests and renders server-side
- In SPA mode: standard Vite HMR
- Watches `app/` and `server/` directories; full-reloads when pages or components are added/removed
- Responds to `SIGTERM` and `SIGINT` with graceful shutdown

---

### `cer-app build`

Builds the application for production.

```sh
cer-app build [options]
```

| Option | Default | Description |
|---|---|---|
| `--root <root>` | `process.cwd()` | Project root directory |
| `--mode <mode>` | From `cer.config.ts` | Override rendering mode: `spa`, `ssr`, or `ssg` |

**Examples:**

```sh
cer-app build
cer-app build --mode ssr
cer-app build --mode ssg
cer-app build --root ./packages/my-app
```

**Per-mode behavior:**

| Mode | Actions |
|---|---|
| `spa` | Standard `vite build` to `dist/` |
| `ssr` | Dual build: client bundle to `dist/client/`, server bundle to `dist/server/server.js` |
| `ssg` | Dual build + enumerate routes + render all paths to `dist/<path>/index.html` |

---

### `cer-app preview`

Serves the production build locally.

```sh
cer-app preview [options]
```

| Option | Default | Description |
|---|---|---|
| `-p, --port <port>` | `4173` | Port to listen on |
| `--host <host>` | `localhost` | Host to bind to |
| `--root <root>` | `process.cwd()` | Project root directory |
| `--ssr` | Auto-detected | Load `dist/server/server.js` as the request handler |

**Examples:**

```sh
cer-app preview                     # SPA/SSG static file server
cer-app preview --ssr               # SSR server using dist/server/server.js
cer-app preview --port 8080
```

**Behavior:**

- If `dist/server/server.js` exists (or `--ssr` is passed), starts an SSR preview server
- Static assets from `dist/client/` are served first; HTML requests fall through to the SSR handler
- Otherwise, starts a static file server with SPA fallback (serves `index.html` for unknown paths)
- Returns 404 for paths not found in `dist/` (static mode only)
- **Path traversal protection:** all file requests are validated against the `dist/` root — requests attempting to escape it (e.g. `GET /../../../../etc/passwd`) receive a `400` response
- **Security headers:** every response includes `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`
- **Smart Cache-Control:** Vite content-hashes assets placed in `/assets/` — these are served with `Cache-Control: public, max-age=31536000, immutable`. All other files (HTML, etc.) use `Cache-Control: no-cache` so browsers always revalidate
- **Graceful shutdown:** on `SIGTERM` or `SIGINT`, the server stops accepting new connections and waits for in-flight requests to finish before exiting. A 10-second timeout triggers a forced exit if connections do not drain
- **Request timeouts:** `headersTimeout` (10 s) aborts connections that stall while sending headers; `requestTimeout` (30 s) limits the total time allowed per request/response cycle, protecting against slow-client attacks

---

### `cer-app generate`

Runs the SSG build pipeline. Alias for `cer-app build --mode ssg`.

```sh
cer-app generate [options]
```

| Option | Default | Description |
|---|---|---|
| `--root <root>` | `process.cwd()` | Project root directory |

**Example:**

```sh
cer-app generate
```

**Output:**

```
dist/
  index.html
  about/index.html
  blog/
    hello-world/index.html
  ssg-manifest.json
```

---

### `cer-app adapt`

Adapts the production build for a deployment platform.

Run this after `cer-app build` to produce the platform-specific output alongside `dist/`.
You can also configure `adapter` in `cer.config.ts` so the adapter runs automatically at the end of every build.

```sh
cer-app adapt [options]
```

| Option | Default | Description |
|---|---|---|
| `--platform <platform>` | *(required)* | Target platform: `vercel`, `netlify`, or `cloudflare` |
| `--root <root>` | `process.cwd()` | Project root directory |

**Examples:**

```sh
cer-app adapt --platform vercel
cer-app adapt --platform netlify
cer-app adapt --platform cloudflare
cer-app adapt --platform vercel --root ./packages/my-app
```

**Vercel behavior (`--platform vercel`):**

- Writes `.vercel/output/` following the [Vercel Build Output API v3](https://vercel.com/docs/build-output-api/v3).
- SSR builds: creates a Node.js Serverless Function at `.vercel/output/functions/index.func/` that routes `/api/*` to the exported API handlers and passes everything else to the SSR handler. Content-hashed assets are copied to `.vercel/output/static/` for CDN delivery.
- SPA/SSG builds: copies static files to `.vercel/output/static/` with a SPA fallback route.
- Deploy with `vercel deploy --prebuilt`.

**Netlify behavior (`--platform netlify`):**

- Writes `netlify/functions/ssr.mjs` — a Netlify Functions v2 bridge that converts the Web `Request`/`Response` API to the Node.js-style handler used by the server bundle. Handles `/api/*` routing inline.
- Copies content-hashed assets to `.netlify/publish/` (no `index.html` — HTML is served by the function).
- Writes `netlify.toml` with the publish directory, `Cache-Control` headers for assets, and a catch-all redirect to the SSR function.
- SPA/SSG builds: writes `netlify.toml` only (no function needed).
- SSR responses are streamed via the Web Streams `TransformStream` API — HTML chunks are forwarded to the client as they are written rather than waiting for the full page to render.
- Deploy with `netlify deploy`.

**Cloudflare behavior (`--platform cloudflare`):**

- Writes `dist/_worker.js` — a Cloudflare Pages [Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/) worker. The client HTML template is inlined in the worker as a string constant so `node:fs` is never needed at runtime.
- Requires the `nodejs_compat` compatibility flag (written automatically into `wrangler.toml`) for `AsyncLocalStorage` and `node:stream` support.
- Copies content-hashed assets to `dist/` alongside the worker. Cloudflare Pages CDN serves matched static files first; all other requests fall through to `_worker.js`.
- SPA/SSG builds: no worker generated — Cloudflare Pages serves `dist/` as a static site.
- SSR responses are streamed via the Web Streams `TransformStream` API — HTML chunks are forwarded to the client as they are written rather than waiting for the full page to render.
- Deploy with `wrangler pages deploy dist`.

**Auto-run via `cer.config.ts`:**

```ts
// cer.config.ts
export default defineConfig({
  mode: 'ssr',
  adapter: 'cloudflare',  // 'vercel' | 'netlify' | 'cloudflare'
  // runs automatically after cer-app build
})
```

---

## `create-cer-app`

Scaffolds a new project from a template.

> **Note:** Because the scaffolder is bundled inside `@jasonshimmy/vite-plugin-cer-app` rather than published as a standalone `create-cer-app` package, you must use the `--package` flag with `npx`:
>
> ```sh
> npx --package @jasonshimmy/vite-plugin-cer-app create-cer-app [project-name] [options]
> ```

| Argument / Option | Description |
|---|---|
| `[project-name]` | Name of the project (also used as the output directory) |
| `--mode <mode>` | Rendering mode: `spa`, `ssr`, or `ssg` (skips interactive prompt) |
| `--dir <dir>` | Output directory (defaults to `project-name`) |

**Examples:**

```sh
npx --package @jasonshimmy/vite-plugin-cer-app create-cer-app                          # interactive prompts
npx --package @jasonshimmy/vite-plugin-cer-app create-cer-app my-app                   # prompts for mode
npx --package @jasonshimmy/vite-plugin-cer-app create-cer-app my-app --mode ssr        # no prompts
npx --package @jasonshimmy/vite-plugin-cer-app create-cer-app my-blog --mode ssg --dir ./sites/blog
```

**Scaffolded files (all modes):**

```
my-app/
  app/
    app.ts          ← framework bootstrap (router, plugins, layout shell)
    pages/index.ts
    layouts/default.ts
  index.html
  cer.config.ts
  package.json
```

**Per-mode differences:**

| Mode | `cer.config.ts` | `package.json` scripts |
|---|---|---|
| SPA | `mode: 'spa'` | `dev`, `build`, `preview` |
| SSR | `mode: 'ssr'` | `dev`, `build`, `preview --ssr` |
| SSG | `mode: 'ssg'`, `ssg.routes: 'auto'` | `dev`, `build`, `preview`, `generate` |

---

## Config file loading

Both `cer-app dev` and `cer-app build` load `cer.config.ts` by:

1. Bundling it with Vite into a temporary `.mjs` file in `node_modules/.cer-app-cache/`
2. Dynamically importing the result

This allows TypeScript syntax in `cer.config.ts` with full type checking. The cached bundle is regenerated on every CLI invocation.

If no `cer.config.ts` or `cer.config.js` is found, defaults are used and a warning is printed.

---

## Using with `npm run`

After scaffolding, scripts are already set up in `package.json`:

```json
{
  "scripts": {
    "dev": "cer-app dev",
    "build": "cer-app build",
    "preview": "cer-app preview",
    "generate": "cer-app generate"
  }
}
```

```sh
npm run dev
npm run build
npm run preview
```

---

## Using with `npx` (no global install)

```sh
npx cer-app dev
npx cer-app build
npx --package @jasonshimmy/vite-plugin-cer-app create-cer-app my-app
```
