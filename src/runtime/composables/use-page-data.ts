/**
 * usePageData — reads SSR-injected loader data for the current page.
 *
 * During SSR/SSG the server calls the matched route's `loader()` function
 * and makes the result available in two ways:
 *
 * 1. **Server render pass** — the data is stored in a per-request
 *    `AsyncLocalStorage` context (set via `_cerDataStore.run(data, ...)` in the
 *    entry-server template). `usePageData()` reads this store so the component
 *    renders with real data in the initial SSR/SSG HTML.
 *
 * 2. **Client hydration** — the server also serializes the data as
 *    `window.__CER_DATA__` in the page `<head>`. On first component render
 *    `usePageData()` returns that value, caches it on the component context, and
 *    returns the same cached value on all subsequent re-renders of that component
 *    instance. The data remains available for the initial hydrated route until
 *    the next client-side navigation clears it before loading new page data.
 *
 * **Why caching is necessary**: the render function passed to `component()` is
 * called on every re-render (it is the render function, not a setup function).
 * Without caching, `usePageData()` could return `null` on later re-renders if a
 * browser upgrades or re-renders the hydrated page after the initial read,
 * flip the `ssrData` guard from truthy → null, and re-trigger client-side fetches.
 *
 * @returns The serialized loader result, or `null` if no SSR data is present.
 *
 * @example
 * ```ts
 * component('page-blog-slug', () => {
 *   const ssrData = usePageData<{ title: string; body: string }>()
 *   const title = ref(ssrData?.title ?? '')
 *   const body  = ref(ssrData?.body  ?? '')
 *
 *   useOnConnected(() => {
 *     if (ssrData) return          // already hydrated from SSR — skip fetch
 *     fetch(`/api/posts/${props.slug}`).then(r => r.json()).then(post => {
 *       title.value = post.title
 *       body.value  = post.body
 *     })
 *   })
 * })
 * ```
 */
import { getCurrentComponentContext } from '@jasonshimmy/custom-elements-runtime'

// Key used to cache the page data on the component context object across re-renders.
const _PAGE_DATA_KEY = '_cerPageData'

export function usePageData<T = unknown>(): T | null {
  const g = globalThis as Record<string, unknown>

  // Server-side: read from the per-request AsyncLocalStorage context.
  // __CER_DATA_STORE__ is set by the entry-server template and is only present
  // in Node.js, so this branch is tree-shaken out of the client bundle.
  const store = g['__CER_DATA_STORE__'] as { getStore(): unknown } | undefined
  if (store) {
    const ssrData = store.getStore() as T | null | undefined
    if (ssrData !== undefined && ssrData !== null) return ssrData
  }

  // Client-side: check the component context cache first.
  // getCurrentComponentContext() returns the context object for the component
  // whose renderFn is currently executing (set by the component() runtime
  // before calling renderFn). Caching on the context ensures the same value is
  // returned on every re-render of the same element instance even if the
  // browser performs a later hydration-time re-render.
  const ctx = getCurrentComponentContext() as Record<string, unknown> | null
  if (ctx) {
    if (_PAGE_DATA_KEY in ctx) {
      return ctx[_PAGE_DATA_KEY] as T | null
    }
  }

  // Read the raw value from the global set by the server-rendered <script> tag.
  const data = g['__CER_DATA__'] as T | undefined | null
  const result: T | null = (data === undefined || data === null) ? null : data

  // Cache on the component context so subsequent re-renders of this element
  // instance return the same value without reading __CER_DATA__ again.
  // Use Object.defineProperty to bypass the reactive Proxy set-trap on context,
  // which would otherwise schedule a spurious re-render (and risk an infinite loop)
  // every time we first cache the value.
  if (ctx) {
    Object.defineProperty(ctx, _PAGE_DATA_KEY, {
      value: result,
      writable: false,
      enumerable: false,
      configurable: true,
    })
  }

  return result
}
