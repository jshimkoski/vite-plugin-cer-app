/**
 * Content fallback page — exercises title/description derivation from body
 * when frontmatter does not supply them.
 *
 * Fetches /blog/no-frontmatter (no frontmatter at all) and renders its
 * derived title and description so Cypress can assert both in all modes.
 *
 * Route: /content-fallback
 */

component('page-content-fallback', () => {
  useHead({ title: 'Content Fallback — Kitchen Sink' })

  const ssrData = usePageData<{ doc: ContentItem | null }>()
  const doc = ref<ContentItem | null>(ssrData?.doc ?? null)

  useOnConnected(async () => {
    if (ssrData) return // already hydrated
    doc.value = await queryContent('/blog/no-frontmatter').first()
  })

  return html`
    <div>
      <h1 data-cy="content-fallback-heading">Content Fallback</h1>
      ${doc.value ? html`
        <p data-cy="content-fallback-title">${doc.value.title}</p>
        <p data-cy="content-fallback-desc">${doc.value.description}</p>
      ` : html`<p data-cy="content-fallback-missing">Document not found.</p>`}
    </div>
  `
})

export const loader = async () => {
  const doc = await queryContent('/blog/no-frontmatter').first()
  return { doc }
}
