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

No import is needed. The framework's auto-import system handles registration before any page code runs.

---

## File → tag name

The tag name is derived from the file path relative to `app/components/`, with path separators replaced by dashes. The file must call `component()` with the matching tag name.

| File | Expected tag name |
|---|---|
| `app/components/my-button.ts` | `my-button` |
| `app/components/ui/card.ts` | `ui-card` (or any name — tag name is from the `component()` call, not the path) |
| `app/components/forms/text-input.ts` | `forms-text-input` |

> **Note:** The framework scans `app/components/` for files and registers them via side-effect imports. The actual custom element tag name comes from the `component('tag-name', …)` call inside the file — the file path does not enforce a specific tag name.

---

## Auto-import behavior

When `autoImports.components` is `true` (the default), the framework generates a `virtual:cer-components` module that side-effect-imports every file in `app/components/`. This module is imported in `app/app.ts` before the router initializes, ensuring all elements are defined before the first render.

Generated module example:

```ts
// virtual:cer-components (auto-generated)
import "/project/app/components/ui/my-button.ts"
import "/project/app/components/forms/text-input.ts"
```

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
// app/app.ts
import './components/ui/my-button.ts'
import './components/forms/text-input.ts'
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

## HMR

When a file is added to or removed from `app/components/`, the `virtual:cer-components` module is invalidated and the browser performs a full reload to re-register the updated element list.

Changes to the contents of an existing component file trigger standard Vite HMR (hot module replacement) without a full reload.
