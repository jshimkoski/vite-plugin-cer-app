component('page-render-spa-test', () => {
  return html`
    <div>
      <h1 data-cy="render-spa-heading">Render SPA Test</h1>
      <p>This page is client-only.</p>
    </div>
  `
})

export const meta = {
  render: 'spa',
}
