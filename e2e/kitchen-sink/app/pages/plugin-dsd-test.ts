export default component('page-plugin-dsd-test', () => {
  return html`
    <div data-cy="plugin-dsd-test-page">
      <h1 data-cy="plugin-dsd-heading">Plugin DSD Test</h1>
      <ks-plugin-card>
        <span data-cy="plugin-card-content">Card content from plugin component</span>
      </ks-plugin-card>
    </div>
  `
})
