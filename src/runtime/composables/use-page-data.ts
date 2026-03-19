/**
 * usePageData — reads SSR-injected loader data for the current page.
 *
 * During SSR/SSG the server calls the matched route's `loader()` function
 * and makes the result available in two ways:
 *
 * 1. **Server render pass** — the data is stored in a per-request
 *    `AsyncLocalStorage` context (set via `_cerDataStore.enterWith(data)`
 *    in the entry-server template). `usePageData()` reads this store so the
 *    component renders with real data in the initial SSR/SSG HTML.
 *
 * 2. **Client hydration** — the server also serializes the data as
 *    `window.__CER_DATA__` in the page `<head>`. The client entry captures
 *    this into `globalThis.__CER_DATA__` before the app boots. On first
 *    component instantiation `usePageData()` returns that value so the client
 *    starts with the correct state without an extra network round-trip.
 *
 * The client-side value is cleared after the first read so subsequent
 * client-side navigations don't accidentally reuse stale SSR data.
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

  // Client-side: read from window.__CER_DATA__ captured by the client entry.
  // Do NOT clear here — the data is cleared by app-template.ts after the
  // initial router.replace() completes. This ensures both the pre-rendered
  // element (upgraded during component registration) and the new element
  // created by router.replace() can both access the SSR data without a
  // race where the first read consumes it before the second can use it.
  const data = g['__CER_DATA__'] as T | undefined
  if (data === undefined || data === null) return null
  return data
}
