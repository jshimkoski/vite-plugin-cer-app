// P1-3: Session secret rotation test page.
// The loader runs server-side where runtimeConfig.private (sessionSecret) is
// available. It signs a session with the configured secret(s) and sets the
// httpOnly cookie. The value returned by the loader is displayed by the
// component, confirming the loader ran successfully.
// (set → response cookie is verified by the companion e2e cookie assertion;
//  the signed token itself is what proves the secret is configured correctly.)
export const loader = async () => {
  const session = useSession<{ user: string }>()
  await session.set({ user: 'rotation-user' })
  return { user: 'rotation-user' }
}

component('page-session-rotation-test', () => {
  const ssrData = usePageData<{ user: string }>()

  return html`
    <div>
      <h1 data-cy="session-rotation-heading">Session Rotation Test</h1>
      <p data-cy="session-read">${ssrData?.user ?? 'loading…'}</p>
    </div>
  `
})

export const meta = { layout: 'default' }
