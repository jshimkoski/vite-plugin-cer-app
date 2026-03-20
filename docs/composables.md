# Composables

Composables are reusable reactive logic functions. Files in `app/composables/` are automatically re-exported as a barrel — you can import from `virtual:cer-composables` anywhere in your app.

---

## Creating a composable

```ts
// app/composables/useTheme.ts
import { ref, computed } from '@jasonshimmy/custom-elements-runtime'

export function useTheme() {
  const theme = ref<'light' | 'dark'>('light')

  const isDark = computed(() => theme.value === 'dark')

  function toggle() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', theme.value)
  }

  return { theme, isDark, toggle }
}
```

---

## Using a composable in a page

When `autoImports.composables` is `true` (the default), composables are **automatically imported** in page, layout, and component files — you don't need to write the import statement at all:

```ts
// app/pages/index.ts
// No import needed — useTheme is auto-imported from virtual:cer-composables
component('page-index', () => {
  const { isDark, toggle } = useTheme()

  return html`
    <button @click="${toggle}">
      Switch to ${isDark.value ? 'light' : 'dark'} mode
    </button>
  `
})
```

If you need to import explicitly (e.g. in a file outside `app/pages/`, `app/layouts/`, or `app/components/`), import from `virtual:cer-composables`:

```ts
import { useTheme } from 'virtual:cer-composables'
```

---

## Virtual module

`virtual:cer-composables` is a generated barrel that re-exports everything from all files in `app/composables/`:

```ts
// virtual:cer-composables (auto-generated)
export * from "/project/app/composables/useTheme.ts"
export * from "/project/app/composables/useAuth.ts"
```

If `app/composables/` does not exist or is empty, the module exports nothing (no error).

---

## File naming

Any `.ts` file in `app/composables/` (including subdirectories) is included. No naming convention is enforced, but `use` prefix is conventional:

```
app/composables/
  useTheme.ts
  useAuth.ts
  data/
    usePosts.ts
```

---

## Side-effect safety

Composables must be side-effect-free at import time. The barrel module is imported during app initialization, before components render. Any code that runs immediately at module scope will execute at that point.

**Safe:**

```ts
// app/composables/useCounter.ts
export function useCounter() {
  const count = ref(0)
  return { count }
}
```

**Avoid:**

```ts
// app/composables/useSession.ts
// ⚠️ This runs at import time, before the DOM is ready
const session = await fetchSession()
export function useSession() { return session }
```

Use `useOnConnected` or lazy initialization inside the function body for side effects.
