// P2-1: A page inside a group directory — inherits group middleware and layout.
component('page-group-meta-test-page', () => {
  return html`
    <div>
      <h1 data-cy="group-page-heading">Group Meta Page</h1>
      <p>This page inherits group middleware and layout from _layout.ts.</p>
    </div>
  `
})
