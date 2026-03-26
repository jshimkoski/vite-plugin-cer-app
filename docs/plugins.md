# App Plugins

Plugins are loaded once before the app renders. They receive an `app` context with `provide` for dependency injection and `router` for registering global navigation guards.

---

## Creating a plugin

```ts
// app/plugins/01.store.ts
import type { AppPlugin } from '@jasonshimmy/vite-plugin-cer-app/types'
import { createStore } from '@jasonshimmy/custom-elements-runtime/store'

export default {
  name: 'app-store',
  setup(app) {
    const store = createStore({ user: null, theme: 'light' })
    app.provide('store', store)
  },
} satisfies AppPlugin
```

---

## Plugin interface

```ts
interface AppPlugin {
  name: string
  setup(app: AppContext): void | Promise<void>
}

interface AppContext {
  provide(key: PropertyKey, value: unknown): void
  router: Router
  config: CerAppConfig
}
```

---

## Load order

Plugins are loaded in filename order. Use a numeric prefix to control sequencing:

```
app/plugins/
  01.store.ts      ← loaded first
  02.auth.ts       ← loaded second
  03.analytics.ts  ← loaded third
  errorHandler.ts  ← loaded after all numbered plugins (alphabetical)
```

- Numbered files (e.g. `01.store.ts`) come before unnumbered files.
- Within the same tier, files are sorted alphabetically.
- The number is stripped; the actual filename is the plugin name by convention.

---

## Dependency injection

Use `app.provide` in the plugin's `setup` to make values available to all components via `inject`:

```ts
// app/plugins/01.store.ts
export default {
  name: 'app-store',
  setup(app) {
    const store = createStore({ count: 0 })
    app.provide('store', store)
  },
}
```

```ts
// app/pages/index.ts
component('page-index', () => {
  const store = useInject<Store>('store')
  const count = computed(() => store?.state.count ?? 0)

  return html`<p>Count: ${count}</p>`
})
```

---

## Async plugins

Plugins can be async. All plugins are awaited in sequence before the app renders:

```ts
// app/plugins/02.auth.ts
export default {
  name: 'auth',
  async setup(app) {
    const session = await fetchSession()
    app.provide('session', session)
  },
}
```

---

## Router guards in plugins

Register global navigation guards via `app.router`:

```ts
// app/plugins/03.analytics.ts
export default {
  name: 'analytics',
  setup(app) {
    app.router.subscribe((to) => {
      trackPageView(to.path)
    })
  },
}
```

---

## Reading provided values with `useInject`

To read values provided by a plugin, use `useInject` instead of the raw `inject()` from the runtime. `useInject` works correctly in **all three modes** — SPA, SSR, and SSG:

```ts
// app/pages/dashboard.ts
component('page-dashboard', () => {
  const store = useInject<Store>('store')

  if (!store) return html`<p>Loading…</p>`

  return html`<p>Count: ${store.state.count}</p>`
})
```

`useInject` is auto-imported in `app/pages/`, `app/layouts/`, and `app/components/` — no explicit import needed.

**Why not raw `inject()`?** In SSR and SSG modes the server renders the component tree directly, without `<cer-layout-view>` establishing the Vue-style provide context. `useInject` bridges this gap:

| Mode | How the value is resolved |
|------|--------------------------|
| SPA / client | `inject()` walks the component tree (provided by `<cer-layout-view>`) |
| SSR (dev & prod) | reads from `globalThis.__cerPluginProvides` (set by the server entry at startup) |
| SSG | same as SSR |

If you need `useInject` outside of auto-imported directories, import it explicitly:

```ts
import { useInject } from '@jasonshimmy/vite-plugin-cer-app/composables'
```

---

## Virtual module

The sorted plugin list is available via `virtual:cer-plugins`:

```ts
import plugins from 'virtual:cer-plugins'
// plugins is an array of AppPlugin objects in load order
```

In `.cer/app.ts` (the auto-generated framework entry), plugins are executed sequentially before the router initializes:

```ts
for (const plugin of plugins) {
  await plugin.setup(appContext)
}
```
