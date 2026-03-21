component('page-render-server-test', () => {
  return html`
    <div>
      <h1 data-cy="render-server-heading">Render Server Test</h1>
      <p>This page always renders server-side.</p>
    </div>
  `
})

export const meta = {
  render: 'server',
}
