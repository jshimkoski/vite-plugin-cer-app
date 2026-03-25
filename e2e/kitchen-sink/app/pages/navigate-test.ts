// Tests programmatic navigation via navigateTo().
component('page-navigate-test', () => {
  return html`
    <div>
      <h1 data-cy="navigate-test-heading">Navigate Test</h1>
      <button data-cy="navigate-to-about" @click="${() => navigateTo('/about')}">
        Go to About
      </button>
      <button data-cy="navigate-to-route-info" @click="${() => navigateTo('/route-info')}">
        Go to Route Info
      </button>
    </div>
  `
})

export const meta = { layout: 'minimal' }
