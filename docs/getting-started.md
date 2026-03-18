# Getting Started

## Prerequisites

- Node.js 18+
- `@jasonshimmy/custom-elements-runtime` ≥ 3.0.0
- Vite ≥ 5.0.0

---

## Option A — Scaffold with `create-cer-app` (recommended)

```sh
npx create-cer-app my-app
```

The interactive prompt asks for a project name and rendering mode:

```
Welcome to create-cer-app!

Project name: my-app
Select app mode:
  1. spa  — Single-Page App (client-side rendering)
  2. ssr  — Server-Side Rendering
  3. ssg  — Static Site Generation
Mode [1/2/3]: 1

Creating SPA project: my-app
  Directory: /path/to/my-app

Project created! To get started:

  cd my-app
  npm install
  npm run dev
```

You can also skip the prompts with flags:

```sh
npx create-cer-app my-app --mode ssr
```

---

## Option B — Add to an existing Vite project

### 1. Install

```sh
npm install -D @jasonshimmy/vite-plugin-cer-app
npm install @jasonshimmy/custom-elements-runtime
```

### 2. Configure Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { cerApp } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  plugins: [cerApp()],
})
```

Or use a separate `cer.config.ts` (picked up automatically by the CLI, and passed manually to `cerApp()` if using `vite.config.ts`):

```ts
// cer.config.ts
import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  mode: 'spa',
})
```

```ts
// vite.config.ts (when using cer.config.ts)
import { defineConfig } from 'vite'
import { cerApp } from '@jasonshimmy/vite-plugin-cer-app'
import cerConfig from './cer.config.ts'

export default defineConfig({
  plugins: [cerApp(cerConfig)],
})
```

### 3. Create the app structure

```sh
mkdir -p app/pages app/layouts app/components app/composables app/plugins app/middleware
mkdir -p server/api server/middleware
```

### 4. Write your first page

```ts
// app/pages/index.ts
// No imports needed — component, html are auto-injected
component('page-index', () => {
  return html`<h1>Hello, World!</h1>`
})
```

### 5. Write a layout

```ts
// app/layouts/default.ts
component('layout-default', () => {
  return html`
    <header><h1>My App</h1></header>
    <main><slot></slot></main>
  `
})
```

### 6. Create `index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <router-view></router-view>
    <script type="module" src="/app/app.ts"></script>
  </body>
</html>
```

### 7. Create `app/app.ts` (auto-generated if absent)

The framework auto-generates this file when you scaffold a new project. It includes the runtime CSS, DOM JIT CSS for light-DOM utility classes, and the router bootstrap:

```ts
// app/app.ts
import '@jasonshimmy/custom-elements-runtime/css'
import 'virtual:cer-components'
import routes from 'virtual:cer-routes'
import plugins from 'virtual:cer-plugins'
import { registerBuiltinComponents } from '@jasonshimmy/custom-elements-runtime'
import { initRouter } from '@jasonshimmy/custom-elements-runtime/router'
import { enableJITCSS } from '@jasonshimmy/custom-elements-runtime/jit-css'
import { createDOMJITCSS } from '@jasonshimmy/custom-elements-runtime/dom-jit-css'

registerBuiltinComponents()

// Enable JIT CSS globally for all Shadow DOM components.
enableJITCSS()

const router = initRouter({ routes })

for (const plugin of plugins ?? []) {
  if (plugin && typeof plugin.setup === 'function') {
    await plugin.setup({ router, provide: (key, value) => { globalThis[key] = value }, config: {} })
  }
}

if (typeof window !== 'undefined') {
  await router.replace(window.location.pathname + window.location.search + window.location.hash)
  createDOMJITCSS().mount()
}

export { router }
```

---

## Running the dev server

```sh
# Using the CLI (reads cer.config.ts automatically)
npx cer-app dev

# Or via npm scripts (after scaffolding)
npm run dev
```

The dev server starts on `http://localhost:3000` by default.

---

## Building for production

```sh
# SPA build
npx cer-app build

# SSR build (dual client + server bundles)
npx cer-app build --mode ssr

# SSG build (renders all routes to static HTML at build time)
npx cer-app build --mode ssg
# or equivalently:
npx cer-app generate
```

### Build outputs

| Mode | Output |
|---|---|
| `spa` | `dist/` — standard Vite client bundle |
| `ssr` | `dist/client/` + `dist/server/server.js` |
| `ssg` | `dist/<route>/index.html` per page + `dist/ssg-manifest.json` |

---

## Previewing the build

```sh
# SPA / SSG (static file server)
npx cer-app preview

# SSR (loads dist/server/server.js as the request handler)
npx cer-app preview --ssr
```

Preview runs on `http://localhost:4173` by default.

---

## Scaffolded project scripts

All three modes produce a `package.json` with these scripts:

| Mode | `dev` | `build` | `preview` | `generate` |
|---|---|---|---|---|
| SPA | `cer-app dev` | `cer-app build` | `cer-app preview` | — |
| SSR | `cer-app dev` | `cer-app build` | `cer-app preview --ssr` | — |
| SSG | `cer-app dev` | `cer-app build` | `cer-app preview` | `cer-app generate` |
