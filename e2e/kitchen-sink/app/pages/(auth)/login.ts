component('page-login', () => {
  return html`
    <div>
      <h1 data-cy="login-heading">Login</h1>
      <p data-cy="login-description">This page uses the <strong>minimal</strong> layout.</p>
      <button data-cy="login-btn" @click="${() => { localStorage.setItem('ks-token', '1'); location.href = '/protected' }}">
        Simulate Login
      </button>
    </div>
  `
})

export const meta = { layout: 'minimal' }
