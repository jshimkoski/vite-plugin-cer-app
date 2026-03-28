# Components

Files in `app/components/` are automatically registered as custom elements and available throughout the application — no explicit import required.

---

## Creating a component

```ts
// app/components/ui/my-button.ts
component('my-button', () => {
  const props = useProps({ label: 'Click me', disabled: false })

  return html`
    <button :disabled="${props.disabled}">
      ${props.label}
    </button>
  `
})
```

Use it in any page or layout:

```ts
// app/pages/index.ts
component('page-index', () => {
  return html`
    <div>
      <my-button label="Submit"></my-button>
    </div>
  `
})
```

No import is needed. The framework scans each file's `html\`` templates and injects static `import` statements automatically.

---

## File → tag name

The tag name is derived from the file path relative to `app/components/`, with path separators replaced by dashes. The file must call `component()` with the matching tag name.

| File | Expected tag name |
|---|---|
| `app/components/my-button.ts` | `my-button` |
| `app/components/ui/card.ts` | `ui-card` (or any name — tag name is from the `component()` call, not the path) |
| `app/components/forms/text-input.ts` | `forms-text-input` |

> **Note:** The tag name comes from the `component('tag-name', …)` call inside the file — the file path does not enforce a specific tag name.

---

## Code splitting

Components are automatically code-split per page. Only the components a given page actually uses are loaded when that page is visited.

The framework's build plugin (`cerComponentImports`) scans each page, layout, and component file for custom element tags in `html\`` template literals. For every tag it finds, it injects a static `import` at the top of that file pointing to the component's source file. Rollup then uses these graph edges to split components into the chunk for the page that uses them.

**Example:** A project with 500 components where `/home` uses `<ks-badge>` and `/about` uses nothing will produce:

- `home` chunk: includes `ks-badge.ts` + transitive deps
- `about` chunk: does not include any component files

Transitive dependencies are handled automatically: if `ks-card` uses `<ks-badge>` in its own template, the transform injects a `ks-badge` import into `ks-card.ts`, and Rollup traces the full dependency graph.

**Components used in layouts** load eagerly by design. Since layouts are imported for every route, their component imports are always included in the initial bundle.

---

## Auto-import behavior

When `autoImports.components` is `true` (the default), the framework's Vite transform hook:

1. Builds a manifest mapping tag names → source files by scanning `app/components/`
2. Transforms each page, layout, and component file: reads its `html\`` templates, extracts custom element tag names, and prepends static `import` statements for the matching source files
3. Rollup uses these imports as graph edges for automatic chunk splitting

No generated virtual module is involved. Component registration is purely driven by the module graph.

---

## Opting out

If you need to manage component registration manually, set `autoImports.components: false` in `cer.config.ts` and import components explicitly:

```ts
// cer.config.ts
export default defineConfig({
  autoImports: { components: false },
})
```

```ts
// app/plugins/components.ts — import from a plugin so they register before the first render
import '../components/ui/my-button.ts'
import '../components/forms/text-input.ts'
```

---

## Runtime auto-imports inside component files

Files in `app/components/` also benefit from `autoImports.runtime`. When `runtime: true` (the default), `component`, `html`, `ref`, `useProps`, `useEmit`, and all other runtime identifiers are injected automatically at the top of each component file if they are used.

This means you can write:

```ts
// app/components/my-counter.ts
component('my-counter', () => {
  const count = ref(0)
  return html`
    <button @click="${() => count.value++}">Count: ${count}</button>
  `
})
```

Without needing to add:

```ts
import { component, html, ref } from '@jasonshimmy/custom-elements-runtime'
```

---

## Accessing slot content with `useSlots()`

Use `useSlots()` inside a component's render function to read the content passed to named or default slots:

```ts
// app/components/ui-badge.ts
component('ui-badge', () => {
  const slots = useSlots()

  return html`
    <span class="badge">
      ${slots.default ?? 'badge'}
    </span>
  `
})
```

Usage in a page:

```ts
// app/pages/index.ts
component('page-index', () => {
  return html`
    <ui-badge>v1.0.0</ui-badge>
    <ui-badge>beta</ui-badge>
  `
})
```

`slots.default` contains the light-DOM children passed to the component. Named slots are accessed by their slot name:

```ts
// app/components/app-card.ts
component('app-card', () => {
  const slots = useSlots()

  return html`
    <div class="card">
      <header>${slots.header}</header>
      <main>${slots.default}</main>
      <footer>${slots.footer}</footer>
    </div>
  `
})
```

```html
<!-- usage -->
<app-card>
  <span slot="header">Title</span>
  Body content goes here
  <span slot="footer">Footer</span>
</app-card>
```

---

## `defineAsyncComponent`

`defineAsyncComponent` registers a custom element whose implementation is loaded asynchronously. Use it for heavy components that should not block the initial render.

```ts
defineAsyncComponent(
  'ks-chart',
  () => import('./chart-impl').then(m => m.render),  // returns a render fn
  {
    loading: () => html`<p>Loading chart…</p>`,          // shown while loading
    error:   () => html`<p>Failed to load chart.</p>`,   // shown on rejection
    timeout: 5000,                                        // ms before showing error (optional)
  },
)
```

The element transitions through four states:

| State | Description |
|---|---|
| `loading` | Loader promise is pending. The `loading` template is rendered if provided. |
| `resolved` | Loader resolved. The returned render function is called and its output is rendered. |
| `error` | Loader rejected or timeout exceeded. The `error` template is rendered if provided. |
| `idle` | No loader started yet (element connected before the loader is called). |

**Loader return value:** The promise must resolve with a render function `() => TemplateResult | string`. The render function is called inside the component's normal reactive context — `useProps`, `ref`, etc. are available.

**Timeout:** If `timeout` is set and the loader does not resolve within that many milliseconds, the state moves to `error` and the `error` template is rendered.

**Options:**

```ts
interface AsyncComponentOptions {
  loading?: () => TemplateResult | string  // rendered while pending
  error?:   () => TemplateResult | string  // rendered on failure
  timeout?: number                          // milliseconds before treating as error
}
```

`defineAsyncComponent` is auto-imported — no import statement is needed in files under `app/`.

If you need it outside auto-imported directories:

```ts
import { defineAsyncComponent } from '@jasonshimmy/custom-elements-runtime'
```

---

## HMR

Changes to a component file's render logic trigger standard Vite HMR — no full reload required, because the static import edge is already in Vite's module graph.

If a component file's registered tag name changes (e.g. the `component('old-name', …)` call is edited to `component('new-name', …)`), the framework detects the manifest change and sends a full-reload so all pages pick up the updated import graph.

When a new component file is added to `app/components/`, the manifest is updated synchronously via `watchChange`, and a full reload is triggered so the new tag becomes available.
