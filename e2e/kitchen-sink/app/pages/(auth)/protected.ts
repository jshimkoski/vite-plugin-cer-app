component('page-protected', () => {
  // inject() works for SSR and client-side navigations; fall back to the
  // globalThis store for SSG where router-view loads the chunk before
  // cer-layout-view has had a chance to call provide().
  const appProvides = (globalThis as any).__cerPluginProvides as Map<string, unknown> | undefined
  const greeting = inject<string>('ks-greeting') ?? appProvides?.get('ks-greeting') as string | undefined ?? 'No greeting'

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
