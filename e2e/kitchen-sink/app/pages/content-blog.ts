/**
 * Content blog listing page — exercises `queryContent('/blog').find()`.
 * Filters to blog prefix, verifies draft exclusion, and renders titles.
 * Route: /content-blog
 */

component('page-content-blog', () => {
  useHead({ title: 'Content Blog — Kitchen Sink' })

  const ssrData = usePageData<{ posts: ContentMeta[] }>()
  const posts = ref<ContentMeta[]>(ssrData?.posts ?? [])

  useOnConnected(async () => {
    if (ssrData) return // already hydrated
    posts.value = await queryContent('/blog').find()
  })

  return html`
    <div>
      <h1 data-cy="content-blog-heading">Blog Posts</h1>
      <ul data-cy="content-blog-list">
        ${posts.value.map(post => html`
          <li data-cy="content-blog-item" data-path="${post._path}">
            <strong data-cy="content-blog-title">${post.title ?? post._path}</strong>
            ${post.description ? html`<p data-cy="content-blog-desc">${post.description}</p>` : ''}
          </li>
        `)}
      </ul>
      ${posts.value.length === 0 ? html`<p data-cy="content-blog-empty">No posts found.</p>` : ''}
    </div>
  `
})

export const loader = async () => {
  const posts = await queryContent('/blog').find()
  return { posts }
}
