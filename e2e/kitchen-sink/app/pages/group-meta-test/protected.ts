// P2-1: Protected page — group middleware (group-auth) blocks unauthenticated access.
component('page-group-meta-test-protected', () => {
  return html`
    <div>
      <h1 data-cy="protected-page-heading">Protected Page</h1>
    </div>
  `
})
