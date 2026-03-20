component('page-about', () => {
  useHead({
    title: 'About — Kitchen Sink',
    meta: [{ name: 'description', content: 'About the kitchen sink test app.' }],
  })

  return html`
    <div>
      <h1 data-cy="about-heading">About</h1>
      <p data-cy="about-description">This page uses the <strong>minimal</strong> layout.</p>
      <p data-cy="about-layout-note">It also calls <code>useHead()</code> to set title and meta tags.</p>
      <p><a href="/" data-cy="about-back">← Back home</a></p>
    </div>
  `
})

export const meta = { layout: 'minimal' }
