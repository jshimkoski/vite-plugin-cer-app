component('layout-default', () => {
  return html`
    <header>
      <nav>
        <router-link to="/">Home</router-link>
      </nav>
    </header>
    <main>
      <slot></slot>
    </main>
    <footer>
      <p>Built with CER App</p>
    </footer>
  `
})
