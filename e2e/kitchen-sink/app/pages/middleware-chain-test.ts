component('page-middleware-chain-test', () => {
  return html`
    <div>
      <h1 data-cy="chain-heading">Middleware Chain Test</h1>
      <p data-cy="chain-note">
        This page uses both the <code>logger</code> (wrapper) and <code>auth</code> (guard) middleware.
      </p>
    </div>
  `
})

export const meta = { middleware: ['logger', 'auth'] }
