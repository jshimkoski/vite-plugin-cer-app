# Data Loading

Each page can export a `loader` function that runs on the server before the page renders. The data is serialized into the HTML response and rehydrated on the client without a second fetch.

---

## Defining a loader

```ts
// app/pages/blog/[slug].ts
import type { PageLoader } from '@jasonshimmy/vite-plugin-cer-app/types'

component('page-blog-slug', () => {
  const props = useProps({ slug: '', title: '', body: '' })

  return html`
    <article>
      <h1>${props.title}</h1>
      <div>${props.body}</div>
    </article>
  `
})

export const loader: PageLoader = async ({ params }) => {
  const { data: post } = await useFetch(`https://api.example.com/posts/${params.slug}`)
  return { title: post?.title, body: post?.body }
}
```

The object returned by `loader` is serialized and passed as props to the page component.

---

## `PageLoader` signature

```ts
type PageLoader<
  Params extends Record<string, string> = Record<string, string>,
  Data extends Record<string, unknown> = Record<string, unknown>,
> = (ctx: PageLoaderContext<Params>) => Promise<Data>

interface PageLoaderContext<P extends Record<string, string>> {
  params: P                     // URL path parameters
  query: Record<string, string> // Parsed query string
  req: IncomingMessage          // Raw Node.js request object (SSR only)
}
```

---

## SSR data flow

1. A request arrives for `/blog/hello-world`
2. The router matches `app/pages/blog/[slug].ts`
3. The server calls `loader({ params: { slug: 'hello-world' }, query, req })`
4. The returned data is serialized as `window.__CER_DATA__` in a `<script>` tag in the HTML `<head>`:
   ```html
   <script>window.__CER_DATA__ = {"title":"Hello World","body":"..."}</script>
   ```
5. The server renders `<page-blog-slug>` directly into the layout using Declarative Shadow DOM
6. The full HTML (pre-rendered content + client scripts) is sent to the browser

---

## Client hydration flow

1. Browser receives the full HTML — content is immediately visible via Declarative Shadow DOM before any JS runs
2. Client JS boots; `usePageData()` reads `window.__CER_DATA__` and returns the hydrated values
3. After the initial `router.replace()` in `.cer/app.ts` completes, `.cer/app.ts` deletes `window.__CER_DATA__` so subsequent client-side navigations trigger a fresh fetch instead of reusing stale server data
4. Components that received SSR data skip their `useOnConnected` fetch — no duplicate request

---

## Client-side navigation and loaders

Loaders run on the client too — before every navigation. This means `useProps()` and `usePageData()` both work correctly for client-side route transitions, not just on initial SSR/SSG load.

When `router.push('/path')` is called:
1. The route module is dynamically imported
2. If the module exports a `loader`, it is called with `{ params, query }`
3. Primitive return values (strings, numbers, booleans) are set as HTML attributes on the page element so `useProps()` can read them
4. All return values are stored in `globalThis.__CER_DATA__` so `usePageData()` also returns them
5. The page component renders with the correct data immediately — no loading flash or re-render

```ts
// app/pages/profile.ts
component('page-profile', () => {
  // Works on initial load AND client navigation
  const props = useProps<{ username: string; bio: string }>({ username: '', bio: '' })

  return html`
    <h1>${props.username}</h1>
    <p>${props.bio}</p>
  `
})

export const loader = async ({ params }: { params: { id: string } }) => {
  const { data: user } = await useFetch(`/api/users/${params.id}`)
  return { username: user?.name, bio: user?.bio }
}
```

> **Note:** Only primitive values (strings, numbers, booleans) are forwarded as element attributes. Complex objects (arrays, nested objects) should be accessed via `usePageData()` instead of `useProps()`.

---

## Accessing loader data in components

The loader's return value is passed as props. Use `useProps` to receive them:

```ts
component('page-user', () => {
  // Loader returns { user: { id, name, email } }
  const props = useProps<{ user: { id: string; name: string; email: string } }>({
    user: { id: '', name: '', email: '' },
  })

  return html`
    <h1>Hello, ${props.user.name}</h1>
    <p>${props.user.email}</p>
  `
})

export const loader: PageLoader<{ id: string }> = async ({ params }) => {
  const user = await fetchUser(params.id)
  return { user }
}
```

---

## SSG and loaders

In SSG mode, `loader` is called at build time for each generated path. The data is baked into the static HTML file and no server is required at runtime.

```ts
// app/pages/blog/[slug].ts
export const meta = {
  ssg: {
    paths: async () => [
      { params: { slug: 'hello-world' } },
      { params: { slug: 'second-post' } },
    ],
  },
}

export const loader: PageLoader<{ slug: string }> = async ({ params }) => {
  // Called once per path during `cer-app generate`
  const post = await fetchPost(params.slug)
  return { post }
}
```

---

## Error handling in loaders

When a `loader` throws, the SSR error boundary intercepts it:

- If `app/error.ts` exists, the server renders the `page-error` component instead of the normal page and returns the appropriate HTTP status.
- If `app/error.ts` does not exist, the error is logged to the server console and a blank 500 response is returned.

To send a specific HTTP status code from a loader, attach a `status` property to the thrown error:

```ts
export const loader: PageLoader<{ id: string }> = async ({ params }) => {
  const item = await db.item.findById(params.id)
  if (!item) {
    const err = Object.assign(new Error('Not Found'), { status: 404 })
    throw err
  }
  return { item }
}
```

You can also throw a standard `Response` — the framework reads its `.status` property:

```ts
throw new Response('Not Found', { status: 404 })
```

Unhandled errors without a `status` property default to HTTP 500.

---

## Error boundary — `app/error.ts`

Create `app/error.ts` to define a custom error page shown when navigation fails. The file must export a custom element named `page-error`:

```ts
// app/error.ts
component('page-error', () => {
  const props = useProps<{ error: string; status: string }>({
    error: 'An unexpected error occurred.',
    status: '500',
  })

  return html`
    <div style="padding:2rem">
      <h2 style="color:#c00">Error ${props.status}</h2>
      <p>${props.error}</p>
      <button @click="${() => (globalThis as any).resetError?.()}">
        Try again
      </button>
    </div>
  `
})
```

### Props received by `page-error`

| Prop | Type | Source |
|------|------|--------|
| `error` | `string` | Error message from the thrown value |
| `status` | `string` | HTTP status code as a string (`"404"`, `"500"`, etc.) — **SSR only** |

### `resetError()`

The framework exposes `globalThis.resetError()` as a global function. Calling it clears the error state and re-navigates to the current path, giving the user a way to recover without a full page reload.

```ts
// Call from a button click handler inside page-error
(globalThis as any).resetError?.()
```

### SSR vs. client-side behavior

| Scenario | Behavior |
|----------|----------|
| **Loader throws during SSR** | Server renders `page-error` with `error` and `status` props; response uses the thrown status code |
| **Navigation throws on the client** | `cer-layout-view` renders `page-error` with `error` prop only (no HTTP status in the browser) |
| **No `app/error.ts` defined (SSR)** | Error is logged to the server console; blank 500 response |
| **No `app/error.ts` defined (client)** | Raw error message rendered in a `<div>` |

> **SPA mode:** There is no server-side error boundary in SPA mode. The `loader` function is never called server-side, so `page-error` is only rendered for client-side navigation errors. To handle loading failures in SPA, catch errors inside `useOnConnected` and render an error state manually.

---

## Loader vs. client-side fetching

Use `loader` for data that:
- Must be present on initial render (SEO, no loading spinner)
- Is fetched from a database or internal service not accessible from the browser
- Benefits from server-side caching or authentication via cookies

Use client-side fetching (`fetch` or composables) for:
- Data loaded after user interaction
- Paginated or infinite-scroll content
- Real-time updates

---

## TypeScript generics

The `PageLoader` type accepts two generics:

```ts
// PageLoader<Params, Data>
export const loader: PageLoader<
  { id: string },               // URL params shape
  { user: User; posts: Post[] } // Return data shape
> = async ({ params }) => {
  return { user: await fetchUser(params.id), posts: await fetchPosts(params.id) }
}
```

---

## Multi-mode data loading (SPA fallback)

When building a page that needs to work in **all three modes** — SSR/SSG (with a `loader`) and SPA (no server, no loader) — use the following pattern:

1. In SSR/SSG, the server runs `loader` and injects the data via `window.__CER_DATA__`. `usePageData()` returns it immediately; `useOnConnected` sees `ssrData` and skips the client fetch.
2. In SPA mode there is no server, so `ssrData` is `null`. The client tries the API first, then falls back to a direct module import.

```ts
// app/pages/blog/index.ts
component('page-blog-index', () => {
  const ssrData = usePageData<{ posts: Post[] }>()
  const posts = ref<Post[]>(ssrData?.posts ?? [])

  useOnConnected(async () => {
    if (ssrData) return  // SSR/SSG: already hydrated, skip the fetch

    // SPA: try the API server first
    try {
      const r = await fetch('/api/posts')
      if (r.ok) {
        posts.value = await r.json()
        return
      }
    } catch { /* no API server in static preview */ }

    // SPA static fallback: import data directly from source
    const { posts: staticPosts } = await import('../data/posts')
    posts.value = staticPosts
  })

  return html`<ul>${posts.value.map(p => html`<li>${p.title}</li>`)}</ul>`
})

// loader runs in SSR and SSG only
export const loader = async () => {
  const { data: posts } = await useFetch<Post[]>('/api/posts')
  return { posts: posts ?? [] }
}
```

The key rule: **always check `ssrData` before fetching on the client**. This prevents a redundant network request when the data was already serialized by the server.
