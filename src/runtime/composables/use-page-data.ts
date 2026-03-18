/**
 * usePageData — reads SSR-injected loader data for the current page.
 *
 * During SSR/SSG the server calls the matched route's `loader()` function,
 * serializes the result as `window.__CER_DATA__`, and injects it into the
 * HTML `<head>`. On client hydration this composable reads that payload so
 * the page component can skip the initial data fetch.
 *
 * The data is cleared after the first call so subsequent client-side
 * navigations don't accidentally serve stale SSR data.
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
  // Works in both SSR (globalThis) and browser (window) contexts.
  const g = globalThis as Record<string, unknown>
  const data = g['__CER_DATA__'] as T | undefined
  if (data === undefined || data === null) return null
  // Clear so that subsequent client navigations don't reuse stale SSR data.
  delete g['__CER_DATA__']
  return data
}
