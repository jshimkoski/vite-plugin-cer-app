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
    <cer-layout-view></cer-layout-view>
    <script type="module" src="/app/app.ts"></script>
  </body>
</html>
```

### 7. Create `app/app.ts` (auto-generated if absent)

The framework generates this file when you scaffold a new project. It bootstraps the router, registers all auto-discovered components, runs plugins, and mounts the app:

```ts
// app/app.ts
import '@jasonshimmy/custom-elements-runtime/css'
import 'virtual:cer-components'
import routes from 'virtual:cer-routes'
import layouts from 'virtual:cer-layouts'
import plugins from 'virtual:cer-plugins'
import { hasLoading, loadingTag } from 'virtual:cer-loading'
import { hasError, errorTag } from 'virtual:cer-error'
import {
  component, ref, provide,
  useOnConnected, useOnDisconnected,
  registerBuiltinComponents,
} from '@jasonshimmy/custom-elements-runtime'
import { initRouter } from '@jasonshimmy/custom-elements-runtime/router'
import { enableJITCSS } from '@jasonshimmy/custom-elements-runtime/jit-css'
import { createDOMJITCSS } from '@jasonshimmy/custom-elements-runtime/dom-jit-css'

registerBuiltinComponents()
enableJITCSS()

const router = initRouter({ routes })

const isNavigating = ref(false)
const currentError = ref(null)
;(globalThis as any).resetError = () => {
  currentError.value = null
  router.replace(router.getCurrent().path)
}

const _push = router.push.bind(router)
const _replace = router.replace.bind(router)
router.push = async (path) => {
  isNavigating.value = true; currentError.value = null
  try { await _push(path) } catch (err) { currentError.value = err instanceof Error ? err.message : String(err) } finally { isNavigating.value = false }
}
router.replace = async (path) => {
  isNavigating.value = true; currentError.value = null
  try { await _replace(path) } catch (err) { currentError.value = err instanceof Error ? err.message : String(err) } finally { isNavigating.value = false }
}

// _pluginProvides is populated by plugin setup and forwarded into the component
// context tree via provide() inside cer-layout-view so inject() works in all modes.
// Also exposed on globalThis for the SSG timing edge case — see docs/plugins.md.
const _pluginProvides = new Map<string, unknown>()
;(globalThis as any).__cerPluginProvides = _pluginProvides

component('cer-layout-view', () => {
  for (const [key, value] of _pluginProvides) { provide(key, value) }

  const current = ref(router.getCurrent())
  let unsub: (() => void) | undefined
  useOnConnected(() => { unsub = router.subscribe((s) => { current.value = s }) })
  useOnDisconnected(() => { unsub?.(); unsub = undefined })

  if (currentError.value !== null) {
    if (hasError && errorTag) return { tag: errorTag, props: { attrs: { error: String(currentError.value) } }, children: [] }
    return { tag: 'div', props: { attrs: { style: 'padding:2rem;font-family:monospace' } }, children: String(currentError.value) }
  }
  if (isNavigating.value && hasLoading && loadingTag) return { tag: loadingTag, props: {}, children: [] }

  const matched = router.matchRoute(current.value.path)
  const layoutName = (matched?.route as any)?.meta?.layout ?? 'default'
  const layoutTag = (layouts as Record<string, string>)[layoutName]
  const routerView = { tag: 'router-view', props: {}, children: [] }
  return layoutTag ? { tag: layoutTag, props: {}, children: [routerView] } : routerView
})

// Plugins run AFTER cer-layout-view is defined so provide() calls from plugins
// are forwarded into the component tree on the very first render.
for (const plugin of plugins ?? []) {
  if (plugin && typeof plugin.setup === 'function') {
    await plugin.setup({ router, provide: (key, value) => { _pluginProvides.set(key, value) }, config: {} })
  }
}

// Pre-load the current page's route chunk AFTER plugins run.
// This ensures cer-layout-view's first render (and its provide() calls) completes
// before page component modules are imported and their renders are scheduled.
if (typeof window !== 'undefined') {
  const _initMatch = router.matchRoute(window.location.pathname)
  if (_initMatch?.route?.load) {
    try { await _initMatch.route.load() } catch { /* non-fatal */ }
  }
}

if (typeof window !== 'undefined') {
  await _replace(window.location.pathname + window.location.search + window.location.hash)
  delete (globalThis as any).__CER_DATA__
  createDOMJITCSS().mount()
}

export { router }
```

> **Note:** Do not move the plugin loop before `component('cer-layout-view', …)`. The layout component must be defined first so that when plugins call `app.provide()`, the values are available to the component tree from the very first render. See [Plugins](plugins.md) for details.

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
