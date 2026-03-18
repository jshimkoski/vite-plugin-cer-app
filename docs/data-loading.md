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
  const post = await fetch(`https://api.example.com/posts/${params.slug}`)
    .then(r => r.json())
  return { title: post.title, body: post.body }
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
4. The returned data is serialized as `window.__CER_DATA__` in a `<script>` tag in the HTML:
   ```html
   <script>window.__CER_DATA__ = {"title":"Hello World","body":"..."}</script>
   ```
5. `renderToString` or `renderToStream` renders `<page-blog-slug>` with the data as props
6. The full HTML is sent to the browser

---

## Client hydration flow

1. Browser receives the full HTML (no layout flash because of Declarative Shadow DOM)
2. The runtime reads `window.__CER_DATA__` and passes the values as component props
3. Components attach event listeners to the pre-rendered DOM — no re-fetch required

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

Unhandled errors in `loader` propagate to the SSR error handler and return a 500 response. Handle expected failures explicitly:

```ts
export const loader: PageLoader<{ id: string }> = async ({ params }) => {
  const item = await db.item.findById(params.id)
  if (!item) {
    throw new Response('Not Found', { status: 404 })
  }
  return { item }
}
```

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
