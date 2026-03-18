# Configuration

The framework is configured via `cer.config.ts` at the project root. All fields are optional — defaults are listed below.

```ts
// cer.config.ts
import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  mode: 'spa',
  srcDir: 'app',
  port: 3000,

  ssr: {
    dsd: true,
    streaming: false,
  },

  ssg: {
    routes: 'auto',
    concurrency: 4,
    fallback: false,
  },

  router: {
    base: '/',
  },

  jitCss: {
    content: ['./app/pages/**/*.ts', './app/components/**/*.ts', './app/layouts/**/*.ts'],
    extendedColors: false,
  },

  autoImports: {
    components: true,
    composables: true,
    directives: true,
    runtime: true,
  },
})
```

---

## Top-level options

### `mode`

**Type:** `'spa' | 'ssr' | 'ssg'`
**Default:** `'spa'`

Selects the rendering strategy for the application.

- `'spa'` — Client-side only. Standard Vite build, no server rendering.
- `'ssr'` — Server-side rendering. Dual build (client + server bundles). Requires a Node.js server.
- `'ssg'` — Static site generation. All routes rendered to HTML at build time.

See [Rendering Modes](rendering-modes.md) for full details.

---

### `srcDir`

**Type:** `string`
**Default:** `'app'`

Path to the client app source directory, relative to the project root. All `app/` paths below (`pages/`, `layouts/`, etc.) resolve under this directory.

```ts
srcDir: 'src/app'  // → pages at src/app/pages/, etc.
```

---

### `port`

**Type:** `number`
**Default:** `3000`

Dev server port. Overridden by the `--port` CLI flag.

---

## `ssr` options

Controls SSR rendering behavior.

```ts
ssr: {
  dsd: true,       // Emit Declarative Shadow DOM
  streaming: false // Use streaming renderer (createStreamingSSRHandler)
}
```

### `ssr.dsd`

**Type:** `boolean`
**Default:** `true`

When `true`, renders components with [Declarative Shadow DOM](https://developer.chrome.com/docs/css-ui/declarative-shadow-dom) markup. This eliminates Flash of Unstyled Content (FOUC) because styles are embedded directly in the HTML.

### `ssr.streaming`

**Type:** `boolean`
**Default:** `false`

When `true`, uses the streaming SSR renderer (`createStreamingSSRHandler`) to progressively flush HTML to the client. When `false`, collects the full HTML string before sending.

---

## `ssg` options

Controls static site generation.

```ts
ssg: {
  routes: 'auto',
  concurrency: 4,
  fallback: false,
}
```

### `ssg.routes`

**Type:** `'auto' | string[]`
**Default:** `'auto'`

Which paths to generate at build time.

- `'auto'` — Scans `app/pages/` and generates all static routes. For dynamic routes, calls `meta.ssg.paths()` to enumerate paths.
- `string[]` — Explicit list of paths, e.g. `['/about', '/blog/hello-world']`.

### `ssg.concurrency`

**Type:** `number`
**Default:** `4`

Number of pages rendered in parallel during the SSG build.

### `ssg.fallback`

**Type:** `boolean`
**Default:** `false`

When `true`, unenumerated dynamic routes fall back to SSR at request time instead of returning 404.

---

## `router` options

Passed to the underlying `useRouter()` call.

```ts
router: {
  base: '/',
  scrollToFragment: { enabled: true, offset: 0 },
}
```

### `router.base`

**Type:** `string`
**Default:** `'/'`

Base path for all routes. Use when deploying to a sub-path, e.g. `'/my-app'`.

### `router.scrollToFragment`

**Type:** `boolean | { enabled: boolean; offset: number }`

Controls scroll-to-fragment (`#anchor`) behavior.

---

## `jitCss` options

Passed to the runtime's `cerPlugin` for JIT (just-in-time) CSS generation.

```ts
jitCss: {
  content: ['./app/pages/**/*.ts', './app/components/**/*.ts', './app/layouts/**/*.ts'],
  extendedColors: false,
}
```

### `jitCss.content`

**Type:** `string[]`
**Default:** Pages, components, and layouts directories.

Glob patterns pointing to files that use utility classes. The JIT compiler scans these files to generate CSS.

### `jitCss.extendedColors`

**Type:** `boolean`
**Default:** `false`

Enables the extended color palette in the JIT CSS system.

---

## `autoImports` options

Controls which identifiers are automatically injected at the top of files in `app/pages/`, `app/layouts/`, and `app/components/`.

```ts
autoImports: {
  components: true,   // virtual:cer-components (auto-registers custom elements)
  composables: true,  // virtual:cer-composables (re-exports app/composables/)
  directives: true,   // when, each, match, anchorBlock
  runtime: true,      // component, html, ref, computed, watch, etc.
}
```

When `runtime: true`, the following are injected if used and not already imported:

```ts
import { component, html, css, ref, computed, watch, watchEffect,
         useProps, useEmit, useOnConnected, useOnDisconnected,
         useOnAttributeChanged, useOnError, useStyle, useExpose,
         useSlots, provide, inject, createComposable, nextTick
} from '@jasonshimmy/custom-elements-runtime'
```

When `directives: true`, the following are injected if used and not already imported:

```ts
import { when, each, match, anchorBlock } from '@jasonshimmy/custom-elements-runtime/directives'
```

Set any flag to `false` to opt out and manage imports manually.

---

## Passing config to the Vite plugin directly

When using `vite.config.ts` instead of (or alongside) `cer.config.ts`:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { cerApp } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  plugins: [
    cerApp({
      mode: 'ssr',
      ssr: { dsd: true, streaming: true },
    }),
  ],
})
```

`cerApp()` accepts the same `CerAppConfig` object as `defineConfig()`.

---

## TypeScript types

All config interfaces are exported from `@jasonshimmy/vite-plugin-cer-app/types`:

```ts
import type {
  CerAppConfig,
  SsgConfig,
  JitCssConfig,
  SsrConfig,
  AutoImportsConfig,
} from '@jasonshimmy/vite-plugin-cer-app/types'
```
