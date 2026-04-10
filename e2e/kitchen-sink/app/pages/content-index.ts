/**
 * Content index page — exercises `queryContent().find()` with a page loader.
 * Route: /content-index
 */

component('page-content-index', () => {
  useHead({ title: 'Content Index — Kitchen Sink' })

  const ssrData = usePageData<{ items: ContentMeta[]; total: number }>()
  const items = ref<ContentMeta[]>(ssrData?.items ?? [])
  const total = ref<number>(ssrData?.total ?? 0)

  useOnConnected(async () => {
    if (ssrData) return // already hydrated — skip client fetch
    const all = await queryContent().find()
    items.value = all
    total.value = all.length
  })

  return html`
    <div>
      <h1 data-cy="content-index-heading">All Content</h1>
      <p data-cy="content-total">Total items: <strong>${total.value}</strong></p>
      <ul data-cy="content-list">
        ${items.value.map(item => html`
          <li data-cy="content-item" data-path="${item._path}">
            <strong data-cy="content-item-title">${item.title ?? item._path}</strong>
            ${item.description ? html`<span data-cy="content-item-desc"> — ${item.description}</span>` : ''}
          </li>
        `)}
      </ul>
    </div>
  `
})

export const loader = async () => {
  const all = await queryContent().find()
  return { items: all, total: all.length }
}
