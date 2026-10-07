import type { PageLoaderContext } from '@jasonshimmy/vite-plugin-cer-app/types'
// Tests that useRoute() returns the correct path, params, query, and meta.
component('page-route-info', () => {
  const route = useRoute()
  const data = usePageData<{ token: string; path: string }>()

  return html`
    <div>
      <h1 data-cy="route-info-heading">Route Info</h1>
      <p data-cy="route-path">Path: <code>${route.path}</code></p>
      <p data-cy="route-query">Query: <code>${route.query.token ?? ''}</code></p>
      <p data-cy="route-loader">Loader: <code>${data?.token ?? ''}:${data?.path ?? ''}</code></p>
      <p data-cy="route-meta-title">Meta title: <code>${route.meta?.title ?? 'none'}</code></p>
    </div>
  `
})

export const meta = { layout: 'minimal', title: 'Route Info Page' }

export const loader = async ({ query, req }: PageLoaderContext) => {
  await new Promise(resolve => setTimeout(resolve, 5))
  const route = req ? useRoute() : null
  return { token: route?.query.token ?? query.token ?? '', path: route?.path ?? '/route-info' }
}
