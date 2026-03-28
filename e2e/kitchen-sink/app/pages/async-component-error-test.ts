// P2-4: Page that uses defineAsyncComponent with a failing loader.
defineAsyncComponent(
  'ks-async-fail',
  () => Promise.reject(new Error('Async component load failed')),
  {
    loading: () => html`<p>Loading…</p>`,
    error: () => html`<p data-cy="async-component-error">Failed to load async component</p>`,
  },
)

component('page-async-component-error-test', () => {
  return html`
    <div>
      <h1 data-cy="async-error-page-heading">Async Component Error Test</h1>
      <ks-async-fail></ks-async-fail>
    </div>
  `
})
