component('page-seo-test', () => {
  useSeoMeta({
    title: 'SEO Test — Kitchen Sink',
    description: 'A test page for useSeoMeta().',
    ogTitle: 'SEO Test OG Title',
    ogDescription: 'SEO Test OG description.',
    ogImage: 'https://example.com/og/seo-test.png',
    ogUrl: 'https://example.com/seo-test',
    ogType: 'website',
    ogSiteName: 'Kitchen Sink',
    twitterCard: 'summary_large_image',
    twitterTitle: 'SEO Test Twitter Title',
    twitterSite: '@ks',
    canonical: 'https://example.com/seo-test',
  })

  return html`
    <div>
      <h1 data-cy="seo-test-heading">SEO Test</h1>
      <p data-cy="seo-test-description">This page sets SEO tags via <code>useSeoMeta()</code>.</p>
    </div>
  `
})
