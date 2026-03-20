component('page-error', () => {
  const props = useProps<{ error: string }>({ error: 'An unexpected error occurred.' })

  return html`
    <div data-cy="error-boundary" style="padding:2rem;font-family:sans-serif">
      <h2 data-cy="error-heading" style="color:#c00;margin-top:0">Something went wrong</h2>
      <pre data-cy="error-message" style="background:#fff0f0;border:1px solid #fcc;padding:1rem;border-radius:4px">${props.error}</pre>
      <button data-cy="error-retry" @click="${() => (globalThis as any).resetError?.()}">
        Try again
      </button>
    </div>
  `
})
