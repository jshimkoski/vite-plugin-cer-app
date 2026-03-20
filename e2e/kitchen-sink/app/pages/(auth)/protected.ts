component('page-protected', () => {
  const greeting = useInject<string>('ks-greeting', 'No greeting')

  return html`
    <div>
      <h1 data-cy="protected-heading">Protected Page</h1>
      <p data-cy="protected-note">You are authenticated! This page requires the <code>auth</code> middleware.</p>
      <p data-cy="plugin-greeting">Plugin says: <strong>${greeting}</strong></p>
      <button data-cy="logout-btn" @click="${() => { localStorage.removeItem('ks-token'); location.href = '/protected' }}">
        Log out and reload
      </button>
    </div>
  `
})

export const meta = { middleware: ['auth'] }
