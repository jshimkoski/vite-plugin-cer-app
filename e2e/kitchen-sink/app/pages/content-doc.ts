/**
 * Content doc page — exercises `queryContent('/docs/getting-started').first()`.
 * Verifies full body, TOC headings with id attributes, and excerpt.
 * Route: /content-doc
 */

component('page-content-doc', () => {
  useHead({ title: 'Content Doc — Kitchen Sink' })

  const ssrData = usePageData<{ doc: ContentItem | null }>()
  const doc = ref<ContentItem | null>(ssrData?.doc ?? null)

  useOnConnected(async () => {
    if (ssrData) return // already hydrated
    doc.value = await queryContent('/docs/getting-started').first()
  })

  return html`
    <div>
      <h1 data-cy="content-doc-heading">Doc Viewer</h1>
      ${doc.value ? html`
        <h2 data-cy="content-doc-title">${doc.value.title}</h2>
        <p data-cy="content-doc-desc">${doc.value.description}</p>
        <nav data-cy="content-doc-toc">
          <ul>
            ${(doc.value.toc ?? []).map(h => html`
              <li data-cy="content-doc-toc-item" data-depth="${h.depth}">
                <a href="#${h.id}" data-cy="content-doc-toc-link">${h.text}</a>
              </li>
            `)}
          </ul>
        </nav>
        <div data-cy="content-doc-body">${unsafeHTML(doc.value.body)}</div>
      ` : html`<p data-cy="content-doc-missing">Document not found.</p>`}
    </div>
  `
})

export const loader = async () => {
  const doc = await queryContent('/docs/getting-started').first()
  return { doc }
}
