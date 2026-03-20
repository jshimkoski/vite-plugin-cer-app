component('page-index', () => {
  useHead({
    title: 'Home — Kitchen Sink',
    meta: [{ name: 'description', content: 'Kitchen sink test app.' }],
  })

  return html`
    <div>
      <ks-badge>v1</ks-badge>
      <h1 data-cy="home-heading">Kitchen Sink</h1>
      <p data-cy="home-description">A comprehensive test app for vite-plugin-cer-app.</p>
      <nav data-cy="page-nav">
        <ul>
          <li><a href="/about">About (minimal layout)</a></li>
          <li><a href="/counter">Counter (reactive state + composable)</a></li>
          <li><a href="/head">Head management (useHead)</a></li>
          <li><a href="/blog">Blog (data loader)</a></li>
          <li><a href="/blog/first-post">Blog post (dynamic route)</a></li>
          <li><a href="/items/1">Item detail (route params)</a></li>
          <li><a href="/protected">Protected (middleware)</a></li>
          <li><a href="/login">Login</a></li>
          <li><a href="/not-a-real-page">404 catch-all</a></li>
        </ul>
      </nav>
    </div>
  `
})
