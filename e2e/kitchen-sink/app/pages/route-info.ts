// Tests that useRoute() returns the correct path, params, query, and meta.
component('page-route-info', () => {
  const route = useRoute()

  return html`
    <div>
      <h1 data-cy="route-info-heading">Route Info</h1>
      <p data-cy="route-path">Path: <code>${route.path}</code></p>
      <p data-cy="route-meta-title">Meta title: <code>${route.meta?.title ?? 'none'}</code></p>
    </div>
  `
})

export const meta = { layout: 'minimal', title: 'Route Info Page' }
