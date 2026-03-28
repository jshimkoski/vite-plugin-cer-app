// P1-2: This page is blocked by server middleware that throws { status: 401 }.
// The server should respond with 401, not 500.
component('page-middleware-status-test', () => {
  return html`
    <div>
      <h1>This page is blocked by server middleware</h1>
    </div>
  `
})
