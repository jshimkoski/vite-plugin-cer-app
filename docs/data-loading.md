# Data loading

A page's exported `loader` prepares data before that page renders. It runs on the server for SSR requests, at build time for generated SSG paths, and in the browser for SPA startup and subsequent navigation in all modes. SSR/SSG hydration reuses serialized data when available instead of repeating the initial loader.

```ts
import type { PageLoader } from '@jasonshimmy/vite-plugin-cer-app/types'

export const loader: PageLoader<{ slug: string }, { title: string }> = async ({ params, signal }) => {
  const response = await fetch(`https://api.example.com/posts/${encodeURIComponent(params.slug)}`, { signal })
  if (!response.ok) throw Object.assign(new Error('Post unavailable'), { status: response.status })
  const post = await response.json()
  return { title: post.title }
}

component('page-post', () => {
  const data = usePageData<{ title: string }>()
  return html`<h1>${data?.title ?? ''}</h1>`
})
export default 'page-post'
```

The component helpers in this example are supplied by CER App's default auto-imports. Use explicit runtime/composable imports if auto-imports are disabled.

## Loader context

```ts
interface PageLoaderContext<P extends Record<string, string>> {
  params: P
  query: Record<string, string>
  req?: IncomingMessage
  signal?: AbortSignal
}

type PageLoader<P extends Record<string, string>, D> =
  (context: PageLoaderContext<P>) => D | Promise<D>
```

`req` is present during server rendering and absent in the browser. `signal` is supplied for browser page loads and is aborted when a newer page load supersedes it. Pass it to `fetch()` to cancel network work; cancellation is cooperative. Imports themselves cannot be aborted, and version guards prevent obsolete results from replacing newer page data.

Loaders are part of the browser route graph: keep them browser-safe. Do not import database clients, filesystem code or secrets into a shared page loader. Put privileged work in server API routes and call those APIs from the loader. A pure static SPA/SSG deployment needs a separately available API for such requests. Conditional use of `req` does not by itself keep a server-only dependency out of the browser bundle.

## Server data and hydration

The full loader result is accessible through `usePageData()`. Primitive return values are also forwarded to the page host as attributes for `useProps()`. Complex loader values should be read with `usePageData()`; `useProps()` can still receive complex values through explicit component property bindings.

The server serializes hydration data safely into `globalThis.__CER_DATA__`. Initial SSR/SSG hydration retains that data for components that upgrade later. A subsequent real navigation clears the previous payload and publishes the new loader result only if that navigation is still current.

A page with `meta.hydrate: 'none'` can omit its full loader payload and keep its existing static tree. Explicit interactive descendants receive serialized island props where needed. Browser content imports also discover rendered custom-element hosts, allowing a static page to render a loader-selected document whose content path differs from the route path.

## Client navigation

For `router.push()`, `router.replace()` and browser Back/Forward that changes the page location, CER imports the destination page and runs its loader before publishing the new page data. Fragment-only history traversal does not rerun the loader. SPA startup also runs the loader in the browser; `useOnConnected()` fetching is an alternative for interaction-driven data, not a requirement of SPA mode.

`app/loading.ts` supplies an optional loading boundary. Without one, CER keeps the initial server tree visible while preparing navigation. There is still a network/loading interval; a loader does not guarantee an instantaneous transition.

## Errors and retry

Server loader errors use the thrown numeric `.status` when present and otherwise return 500. CER renders a route-specific or global error component when configured. Without one, the response uses an error document rather than the requested page.

Browser loader and route-import errors reach the client error boundary. With no custom boundary, CER shows the error message. A custom error component receives `error`; server rendering also supplies `status`. `globalThis.resetError()` clears the error and retries the most recently requested page, including its query and fragment.

For deployment-related missing chunks, keep HTML revalidated and retain previous hashed assets where practical. Vite exposes [`vite:preloadError`](https://vite.dev/guide/build.html#load-error-handling) for an application-specific recovery policy. CER does not automatically reload the browser or discard unsaved form state.

## SSG paths

For a dynamic page, enumerate concrete paths:

```ts
export const meta = {
  ssg: {
    paths: async () => [
      { params: { slug: 'hello-world' } },
      { params: { slug: 'second-post' } },
    ],
  },
}
```

The loader runs at build time for each generated path. Browser navigation still runs the browser-safe loader, so subsequent data can be fresher than the original document. Content-backed catch-all routes can use automatic enumeration; see [rendering modes](rendering-modes.md).

## Development

SSR and SSG development modes server-render HTML and run loaders on requests. SPA development serves a shell and runs loaders in the browser. Development SSR does not represent SSG's deployed build-time snapshot or guarantee hosting-platform cache behavior.
