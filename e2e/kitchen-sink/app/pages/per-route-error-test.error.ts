// P2-2: Co-located per-route error component for per-route-error-test.ts.
// Rendered instead of the global error component when this page's loader throws.
component('page-per-route-error-test-error', () => {
  const props = useProps({ error: '', status: '' })

  return html`
    <div data-cy="per-route-error">
      <h1>Per-Route Error</h1>
      <p data-cy="per-route-error-message">${props.error || 'unknown error'}</p>
      <p data-cy="per-route-error-status">${props.status || '500'}</p>
    </div>
  `
})
