component('page-isr-test', () => {
  return html`
    <div>
      <h1 data-cy="isr-test-heading">ISR Test</h1>
      <p data-cy="isr-test-description">
        This page uses <code>revalidate: 0</code> so every post-first request
        is immediately stale.
      </p>
    </div>
  `
})

export const meta = {
  ssg: {
    revalidate: 0,
  },
}
