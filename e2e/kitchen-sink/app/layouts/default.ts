component('layout-default', () => {
  return html`
    <div>
      <header data-cy="site-header">
        <nav data-cy="site-nav">
          <a data-cy="nav-home" href="/">Home</a>
          <a data-cy="nav-about" href="/about">About</a>
          <a data-cy="nav-counter" href="/counter">Counter</a>
          <a data-cy="nav-blog" href="/blog">Blog</a>
          <a data-cy="nav-protected" href="/protected">Protected</a>
        </nav>
      </header>
      <main data-cy="site-main">
        <slot></slot>
      </main>
      <footer data-cy="site-footer">
        <p>Kitchen Sink — testing every framework capability</p>
      </footer>
    </div>
  `
})
