component('layout-admin', () => {
  return html`
    <div data-cy="admin-layout">
      <aside data-cy="admin-sidebar">
        <p>Admin Panel</p>
        <a href="/admin/dashboard" data-cy="admin-nav-dashboard">Dashboard</a>
      </aside>
      <section data-cy="admin-content">
        <slot></slot>
      </section>
    </div>
  `
})
