component('page-observability-test', () => {
  const { public: pub } = useRuntimeConfig()

  // Verify that accessing .private in a browser context throws the Proxy error.
  // The component render function runs client-side (inside the custom element upgrade),
  // so typeof window !== 'undefined' is true here and the Proxy fires.
  let privateError = ''
  if (typeof window !== 'undefined') {
    try {
      const cfg = useRuntimeConfig()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (cfg as any).private
    } catch (e) {
      privateError = (e as Error).message
    }
  }

  return html`
    <div>
      <h1 data-cy="observability-heading">Observability Test</h1>
      <div data-cy="public-app-name">${pub.appName as string}</div>
      <div data-cy="private-proxy-error">${privateError}</div>
    </div>
  `
})
