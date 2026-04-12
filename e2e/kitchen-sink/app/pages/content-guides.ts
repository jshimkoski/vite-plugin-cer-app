/**
 * Content guides listing page — exercises numeric directory/file prefixes in
 * the content layer using `queryContent('/guides').find()`.
 * Route: /content-guides
 */

component('page-content-guides', () => {
  useHead({ title: 'Content Guides — Kitchen Sink' })

  const ssrData = usePageData<{ guides: ContentMeta[] }>()
  const guides = ref<ContentMeta[]>(ssrData?.guides ?? [])

  useOnConnected(async () => {
    if (ssrData) return
    guides.value = await queryContent('/guides').find()
  })

  return html`
    <div>
      <h1 data-cy="content-guides-heading">Guides</h1>
      <ul data-cy="content-guides-list">
        ${guides.value.map((guide, index) => html`
          <li data-cy="content-guides-item" data-path="${guide._path}" data-index="${index}">
            <strong data-cy="content-guides-title">${guide.title ?? guide._path}</strong>
          </li>
        `)}
      </ul>
    </div>
  `
})

export const loader = async () => {
  const guides = await queryContent('/guides').find()
  return { guides }
}