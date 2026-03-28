// P2-1: Landing page when group-auth middleware redirects an unauthenticated user.
component('page-group-auth-blocked', () => {
  return html`
    <div data-cy="group-auth-guard">
      <h1>Access Blocked by Group Middleware</h1>
      <p>The group-auth middleware redirected you here.</p>
    </div>
  `
})
