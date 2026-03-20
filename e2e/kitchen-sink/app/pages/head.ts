component('page-head', () => {
  useHead({
    title: 'Head Test — Kitchen Sink',
    meta: [
      { name: 'description', content: 'A test page for useHead().' },
      { property: 'og:title', content: 'Head Test' },
    ],
    link: [
      { rel: 'canonical', href: 'http://localhost/head' },
    ],
  })

  return html`
    <div>
      <h1 data-cy="head-heading">Head Test</h1>
      <p data-cy="head-description">This page sets document title and meta tags via <code>useHead()</code>.</p>
      <p>Check the page <code>&lt;title&gt;</code> and <code>&lt;meta name="description"&gt;</code> tags.</p>
    </div>
  `
})
