component('page-admin-dashboard', () => {
  const config = useRuntimeConfig()
  const appName = config.public?.appName ?? 'Kitchen Sink'

  return html`
    <div>
      <h1 data-cy="admin-dashboard-heading">Admin Dashboard</h1>
      <p data-cy="admin-app-name">App: ${appName}</p>
    </div>
  `
})
