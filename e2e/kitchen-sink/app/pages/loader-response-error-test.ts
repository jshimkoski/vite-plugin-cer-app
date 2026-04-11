component('page-loader-response-error-test', () => {
  return html`
    <div>
      <h1 data-cy="loader-response-error-heading">Response Error Test</h1>
    </div>
  `
})

export async function loader() {
  // Verify that throwing a Response-like object (which has a numeric .status property)
  // causes the framework to use that status code for the HTTP response.
  throw new Response('Method Not Allowed', { status: 405 })
}
