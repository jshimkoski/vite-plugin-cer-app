component('page-loader-error-test', () => {
  return html`
    <div>
      <h1 data-cy="loader-error-heading">Loader Error Test</h1>
    </div>
  `
})

export async function loader() {
  const err = new Error('Loader intentionally failed') as Error & { status?: number }
  err.status = 503
  throw err
}
