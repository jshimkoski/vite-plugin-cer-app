// P2-1: Group layout — wraps all pages in the group-meta-test directory.
component('layout-group', () => {
  return html`
    <div data-cy="group-layout">
      <header>Group Layout</header>
      <main><slot></slot></main>
    </div>
  `
})
