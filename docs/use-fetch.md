# useFetch

`useFetch` is an isomorphic data-fetching composable. It works differently depending on where it is called:

- **Inside a `component()` render function** — returns reactive `data`, `pending`, and `error` refs that update the component automatically when the request settles.
- **Inside a `loader` or other async server context** — returns a thenable result you can `await` directly to block rendering until data is ready.

---

## Basic usage

```ts
// app/pages/posts.ts
component('page-posts', () => {
  const { data: posts, pending, error } = useFetch<Post[]>('/api/posts')

  return html`
    ${pending.value ? html`<p>Loading…</p>` : ''}
    ${error.value ? html`<p>Error: ${error.value.message}</p>` : ''}
    <ul>
      ${posts.value?.map(p => html`<li>${p.title}</li>`)}
    </ul>
  `
})
```

The fetch fires automatically when the component mounts (`useOnConnected`). `data`, `pending`, and `error` are reactive — the component re-renders whenever any of them change.

---

## Inside a loader

```ts
// app/pages/posts.ts
export const loader = async () => {
  const { data: posts } = await useFetch<Post[]>('/api/posts')
  return { posts }
}
```

When called outside a component context (e.g. in a `loader` or server middleware), `useFetch` returns a thenable `UseFetchResult`. Awaiting it blocks the loader until the fetch completes — the response is serialised into `window.__CER_DATA__` for client hydration.

---

## Options

```ts
useFetch<T>(url: string | (() => string), options?)
```

The `url` argument can be a static string or a factory function that returns a string. Pass a factory when the URL depends on reactive state — the request will re-issue whenever the function returns a different value.

| Option | Type | Default | Description |
|---|---|---|---|
| `key` | `string` | URL string | Unique cache key for this request. On the server, requests with the same key within one SSR pass are de-duplicated. On the client, matching server-fetched data is consumed once for hydration. |
| `lazy` | `boolean` | `false` | Skip the server fetch; only fetch on the client. In component context, also skips the auto-fetch on mount — call `refresh()` manually. |
| `server` | `boolean` | `true` | Equivalent to `lazy: true`. Set `server: false` to skip SSR. |
| `default` | `() => T` | `() => null` | Factory that returns the initial value before the fetch completes. |
| `transform` | `(data: unknown) => T` | — | Transform the raw JSON response before storing it. Applied after `pick`. |
| `pick` | `string[]` | — | Pick a subset of keys from an object response. Applied before `transform`. |
| `method` | `string` | `'GET'` | HTTP method. |
| `body` | `unknown` | — | Request body for POST / PUT / PATCH. Serialised to JSON; sets `Content-Type: application/json` automatically. |
| `headers` | `Record<string, string>` | — | Additional request headers. |
| `query` | `Record<string, string>` | — | Query parameters appended to the URL via `URLSearchParams`. Included in the default cache key. |

---

## Reactive return (component context)

When called inside a `component()` render function, `useFetch` returns a `UseFetchReactiveReturn`:

| Field | Type | Description |
|---|---|---|
| `data` | `ReactiveState<T \| null>` | Reactive result. Access via `.data.value`. |
| `pending` | `ReactiveState<boolean>` | `true` while the request is in-flight. |
| `error` | `ReactiveState<Error \| null>` | Set when the request fails; `null` on success. |
| `refresh()` | `() => Promise<void>` | Re-issues the fetch and updates all three refs. |

---

## Awaitable return (loader / server context)

When called outside a component, `useFetch` returns a `UseFetchResult` — a `UseFetchReturn` plus a `.then()` method:

| Field | Type | Description |
|---|---|---|
| `data` | `T \| null` | Fetch result (available after awaiting). |
| `pending` | `boolean` | `false` after awaiting. |
| `error` | `Error \| null` | Set if the fetch failed. |
| `refresh()` | `() => Promise<UseFetchReturn<T>>` | Re-issues the fetch. |

---

## Lazy fetch — manual trigger

Skip the automatic fetch and call `refresh()` manually:

```ts
component('page-search', () => {
  const query = ref('')

  const { data: results, pending, refresh } = useFetch<Result[]>(
    () => `/api/search?q=${encodeURIComponent(query.value)}`,
    { lazy: true }
  )

  async function search() {
    await refresh()
  }

  return html`
    <input @input="${(e: InputEvent) => { query.value = (e.target as HTMLInputElement).value }}" />
    <button @click="${search}">Search</button>
    ${pending.value ? html`<p>Searching…</p>` : ''}
    <ul>${results.value?.map(r => html`<li>${r.title}</li>`)}</ul>
  `
})
```

---

## POST / mutation

```ts
component('page-new-post', () => {
  const { data, pending, error, refresh: submit } = useFetch<Post>('/api/posts', {
    lazy: true,
    method: 'POST',
    body: { title: 'New Post', content: '...' },
  })

  return html`
    <button @click="${submit}" :disabled="${pending.value}">
      ${pending.value ? 'Saving…' : 'Save'}
    </button>
    ${error.value ? html`<p>Error: ${error.value.message}</p>` : ''}
    ${data.value ? html`<p>Created: ${data.value.title}</p>` : ''}
  `
})
```

---

## Transforming responses

Use `pick` to extract specific keys, or `transform` for arbitrary reshaping:

```ts
const { data: name } = useFetch<string>('/api/me', {
  pick: ['name'],
  transform: (d) => (d as { name: string }).name,
})
```

---

## Server-side de-duplication

On the server, multiple `useFetch` calls with the same `key` within a single SSR request are de-duplicated — only the first network request fires. Results are stored in a per-request cache keyed by `key` (which defaults to the full URL including query params).

```ts
export const loader = async () => {
  // Only one network request is made even if useFetch('/api/user') appears elsewhere
  const { data: user } = await useFetch('/api/user', { key: 'current-user' })
  return { user }
}
```

---

## TypeScript

```ts
import { useFetch } from '@jasonshimmy/vite-plugin-cer-app/composables'
import type {
  UseFetchOptions,
  UseFetchReactiveReturn,
  UseFetchReturn,
  UseFetchResult,
} from '@jasonshimmy/vite-plugin-cer-app/composables'
```

`useFetch` is auto-imported in `app/pages/`, `app/layouts/`, `app/components/`, `app/middleware/`, and `app/composables/`. No import statement is needed in those directories.
