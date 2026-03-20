component('page-404', () => {
  return html`
    <div>
      <h1 data-cy="not-found-heading">404 — Not Found</h1>
      <p data-cy="not-found-description">The page you are looking for does not exist.</p>
      <p><a href="/" data-cy="not-found-home">← Back home</a></p>
    </div>
  `
})
