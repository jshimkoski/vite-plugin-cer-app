interface Post {
  slug: string
  title: string
  excerpt: string
}

component('page-blog', () => {
  useHead({ title: 'Blog — Kitchen Sink' })

  const ssrData = usePageData<{ posts: Post[] }>()
  const posts = ref<Post[]>(ssrData?.posts ?? [])
  // Captured once at element-creation time (during the hydration re-render).
  // 'ssr' proves usePageData() was non-null — the queueMicrotask timing fix works.
  // 'client' means __CER_DATA__ was deleted before setup ran (regression).
  const dataSource = ssrData ? 'ssr' : 'client'

  useOnConnected(async () => {
    if (ssrData) return  // already hydrated — skip client fetch
    try {
      const r = await fetch('/api/posts')
      if (r.ok) {
        const data: Post[] = await r.json()
        if (Array.isArray(data)) { posts.value = data; return }
      }
    } catch { /* no API server (SPA mode) */ }
    // SPA fallback: import post data directly from the source module
    const { posts: staticPosts } = await import('../../../server/data/posts')
    posts.value = staticPosts
  })

  return html`
    <div>
      <h1 data-cy="blog-heading">Blog</h1>
      <p>Posts are loaded via a page <strong>loader</strong> (SSR/SSG) or client-side fetch (SPA).</p>
      <span data-cy="blog-data-source" hidden>${dataSource}</span>
      <ul data-cy="blog-list">
        ${posts.value.map(post => html`
          <li data-cy="blog-item">
            <a href="/blog/${post.slug}" data-cy="blog-link-${post.slug}"><strong>${post.title}</strong></a>
            <p>${post.excerpt}</p>
          </li>
        `)}
      </ul>
    </div>
  `
})

export const loader = async () => {
  const { posts } = await import('../../../server/data/posts')
  return { posts }
}
