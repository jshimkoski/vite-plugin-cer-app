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

## `create-cer-app`

Scaffolds a new project from a template.

```sh
create-cer-app [project-name] [options]
```

| Argument / Option | Description |
|---|---|
| `[project-name]` | Name of the project (also used as the output directory) |
| `--mode <mode>` | Rendering mode: `spa`, `ssr`, or `ssg` (skips interactive prompt) |
| `--dir <dir>` | Output directory (defaults to `project-name`) |

**Examples:**

```sh
create-cer-app                          # interactive prompts
create-cer-app my-app                   # prompts for mode
create-cer-app my-app --mode ssr        # no prompts
create-cer-app my-blog --mode ssg --dir ./sites/blog
```

**Scaffolded files (all modes):**

```
my-app/
  app/
    pages/index.ts
    layouts/default.ts
  cer.config.ts
  package.json
```

**Per-mode differences:**

| Mode | `cer.config.ts` | `package.json` scripts |
|---|---|---|
| SPA | `mode: 'spa'` | `dev`, `build`, `preview` |
| SSR | `mode: 'ssr'`, `ssr.streaming: true` | `dev`, `build`, `preview --ssr` |
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
npx create-cer-app my-app
```
