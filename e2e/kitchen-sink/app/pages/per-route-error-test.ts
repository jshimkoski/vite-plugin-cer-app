// P2-2: Page with a co-located error component.
// The loader throws, so the co-located per-route-error-test.error.ts is rendered.
component('page-per-route-error-test', () => {
  return html`
    <div>
      <h1>Per-Route Error Test</h1>
    </div>
  `
})

export async function loader() {
  const err = new Error('per-route-error intentional') as Error & { status?: number }
  err.status = 422
  throw err
}
