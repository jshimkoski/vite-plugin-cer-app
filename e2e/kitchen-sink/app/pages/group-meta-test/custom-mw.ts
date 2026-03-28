// P2-1: Page-level middleware overrides the group middleware from _layout.ts.
component('page-group-meta-test-custom-mw', () => {
  return html`
    <div>
      <h1 data-cy="custom-mw-marker">Custom Middleware Page</h1>
      <p>This page uses its own middleware, overriding the group default.</p>
    </div>
  `
})

export const meta = {
  // Overrides the group-auth middleware from _layout.ts
  middleware: ['custom-log'],
}
