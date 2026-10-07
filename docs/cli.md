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

- Uses Vite preview for HTTP/HTTPS, MIME types, compression and media range requests. Configure supported options under `preview` in `cer.config.ts`; CLI host/port override those fields.
- Loads the server for SSR and hybrid/fallback SSG builds. `--ssr` explicitly requires a retained server bundle. A pure SSG build stays static even when intermediates were retained only for a custom consumer.
- Existing public assets use Vite's transport. Document/API requests enter CER's shared dispatcher, including document URLs containing dots. Hybrid document middleware runs before SPA shells, prerendered HTML and SSR/ISR.
- Pure SSG serves known generated paths and a dedicated noindex 404 for unknown paths. SPA serves its shell for application routes. Private server/client directories and build manifests are blocked.
- Sets `nosniff`, `DENY` and `strict-origin-when-cross-origin` headers by default; `preview.headers` can override them. `/assets/` receives immutable cache headers; other responses begin with `no-cache`, which application middleware can override.
- CORS is disabled unless explicitly configured; Vary headers from custom CORS/middleware can deliberately bypass shared ISR.
- SIGINT/SIGTERM closes the preview listener and destroys tracked connections. Preview does not promise graceful draining of unfinished responses.
- Where supported by the underlying server, header receipt has a 10-second timeout and incoming request receipt has a 30-second timeout. These are not limits on loader execution or the total response-rendering duration.

Preview is a local build check, not a production hosting server.

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

### `cer-app check`

Runs reusable production-quality gates against a completed build. These checks
exit non-zero on failure, making them suitable for `npm run validate` and CI.

```sh
cer-app check links
cer-app check seo --site-url https://example.com
cer-app check performance --expected-pages 201
cer-app check lighthouse --url http://127.0.0.1:4173 --runs 3
```

| Subcommand | Purpose |
|---|---|
| `links` | Crawls generated HTML and verifies internal routes and fragments. |
| `performance` | Enforces HTML, entry-JavaScript, and total initial-JavaScript gzip budgets. |
| `seo` | Validates generated canonicals, sitemap membership and noindex 404 output. |
| `lighthouse` | Requires median 100 scores for performance, accessibility, best practices, and SEO. |

`links` and `performance` inspect `dist/` by default and accept `--root` and
`--output`. `performance` also accepts `--page`, `--max-html`,
`--max-initial-js`, `--max-entry-js`, and `--expected-pages`.

`lighthouse` requires a locally installed `lighthouse` package and a running
preview server. It accepts multiple URLs, retries transient browser-launch
failures, and uses three runs per URL by default; pass `--desktop` to use the
desktop preset. It honors `CHROME_PATH`, detects common Chrome, Chromium,
Edge, and Brave installations, and also accepts an explicit `--chrome-path`.

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

- Writes `.vercel/output/` using the [Build Output API](https://vercel.com/docs/build-output-api/v3).
- SSR/hybrid/fallback builds use a bundled Node.js 24 function. The function includes lazy server chunks, external JavaScript dependencies and private prerendered documents; document routing and middleware use the shared dispatcher.
- Public assets and generated sitemap/robots/form registration files are copied to `.vercel/output/static/`.
- Pure SSG uses generated documents plus a 404 fallback; SPA uses its index shell fallback.
- Deploy with `vercel deploy --prebuilt`. Native dependencies or arbitrary filesystem assets require additional packaging.

**Netlify behavior (`--platform netlify`):**

- SSR/hybrid/fallback builds write `netlify/functions/ssr.mjs`, a Web Request/Response bridge to the shared Node-style dispatcher. Prerendered documents remain private in `dist` and are served after middleware.
- Copies public client assets and generated public metadata to `.netlify/publish/`; writes `netlify.toml` with asset caching and the function fallback.
- Pure SSG and SPA need no CER function. Their configuration serves a 404 document or SPA shell respectively.
- The shared bridge exposes its Response on first write/flush, preserving progressive streaming, cookies, backpressure and bodyless HEAD/204/205/304 responses.
- Deploy with `netlify deploy`; verify the platform's runtime and bundled dependencies in a deployment smoke test.

**Cloudflare behavior (`--platform cloudflare`):**

- SSR/hybrid/fallback builds bundle the full server graph into `dist/_worker.js`, using Pages [Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/). The client template is embedded; CER's document serving does not require filesystem access at runtime.
- `wrangler.toml` uses compatibility date `2025-09-15`, enables `nodejs_compat` (including filesystem imports and full process support), and declares `pages_build_output_dir`. User dependencies must be compatible with the Workers runtime.
- Advanced-mode workers own requests. The worker forwards public assets through `env.ASSETS`; hybrid prerendered documents pass through middleware, while server/SPA/ISR routes keep their declared behavior.
- Removes server/client intermediates and build manifests from the deployment asset tree after bundling. Rebuild before previewing with CER or selecting another adapter.
- Pure SSG/SPA need no worker. The shared Web bridge provides progressive streaming for dynamic responses.
- Prints actual raw/gzip worker size and warns above CER's 1 MiB gzip advisory budget. This is not a platform plan limit; Wrangler/deployment validates current platform limits.
- Deploy with `wrangler pages deploy dist`; smoke-test first with `wrangler pages dev dist` and then the actual deployment.

**Auto-run via `cer.config.ts`:**

```ts
// cer.config.ts — built-in adapter
export default defineConfig({
  mode: 'ssr',
  adapter: 'vercel',  // 'vercel' | 'netlify' | 'cloudflare'
})
```

```ts
// cer.config.ts — custom adapter (Railway, Fly.io, bare Node.js, Docker, …)
export default defineConfig({
  mode: 'ssr',
  adapter: async (root) => {
    const { cp, mkdir } = await import('node:fs/promises')
    await mkdir(`${root}/deploy`, { recursive: true })
    await cp(`${root}/dist`, `${root}/deploy/dist`, { recursive: true })
  },
})
```

Pass `--platform custom` to `cer-app adapt` to run a function adapter without re-building:

```sh
cer-app adapt --platform custom
```

See [`adapter` in configuration.md](./configuration.md#adapter) for the full options reference.

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
| `--material` | Configure CER Material with tree-shaken components, theme CSS, and subset symbols |
| `--content` | Add a loader-backed Markdown content route and starter document |
| `--tests` | Add a Cypress smoke suite and validation script |

**Examples:**

```sh
npx --package @jasonshimmy/vite-plugin-cer-app create-cer-app                          # interactive prompts
npx --package @jasonshimmy/vite-plugin-cer-app create-cer-app my-app                   # prompts for mode
npx --package @jasonshimmy/vite-plugin-cer-app create-cer-app my-app --mode ssr        # no prompts
npx --package @jasonshimmy/vite-plugin-cer-app create-cer-app my-blog --mode ssg --dir ./sites/blog --material --content --tests
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
