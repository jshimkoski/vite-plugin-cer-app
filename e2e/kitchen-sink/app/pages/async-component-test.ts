// P2-4: Page that uses defineAsyncComponent to lazy-load a component.
defineAsyncComponent(
  'ks-async-loaded',
  () => Promise.resolve(() => html`<p data-cy="async-component-content">Async component loaded!</p>`),
  {
    loading: () => html`<p data-cy="async-loading">Loading async component…</p>`,
    error: () => html`<p data-cy="async-load-error">Failed to load</p>`,
  },
)

component('page-async-component-test', () => {
  return html`
    <div>
      <h1 data-cy="async-page-heading">Async Component Test</h1>
      <ks-async-loaded></ks-async-loaded>
    </div>
  `
})
