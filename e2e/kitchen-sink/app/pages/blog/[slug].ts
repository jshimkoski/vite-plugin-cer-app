interface Post {
  slug: string
  title: string
  body: string
}

component('page-blog-slug', () => {
  const props = useProps<{ slug: string }>({ slug: '' })
  const ssrData = usePageData<Post>()

  const title = ref(ssrData?.title ?? '')
  const body = ref(ssrData?.body ?? '')

  useOnConnected(async () => {
    if (ssrData) return  // already hydrated
    if (!props.slug) return
    try {
      const r = await fetch(`/api/posts/${props.slug}`)
      if (r.ok) {
        const post: Post | null = await r.json()
        if (post) { title.value = post.title; body.value = post.body; return }
      }
    } catch { /* no API server (SPA mode) */ }
    // SPA fallback: import post data directly from the source module
    const { posts } = await import('../../../server/data/posts')
    const post = posts.find((p) => p.slug === props.slug)
    if (post) { title.value = post.title; body.value = post.body }
  })

  return html`
    <div>
      <h1 data-cy="post-title">${title.value || props.slug}</h1>
      <p data-cy="post-slug"><em>slug: <code>${props.slug}</code></em></p>
      <div data-cy="post-body">${body.value}</div>
      <p><a href="/blog" data-cy="post-back">← Back to blog</a></p>
    </div>
  `
})

export const loader = async ({ params }: { params: { slug: string } }) => {
  const { posts } = await import('../../../server/data/posts')
  const post = posts.find((p) => p.slug === params.slug)
  if (!post) throw new Error('Post not found')
  return { slug: post.slug, title: post.title, body: post.body }
}

export const meta = {
  ssg: {
    revalidate: 60,
    paths: async () => [
      { params: { slug: 'first-post' } },
      { params: { slug: 'second-post' } },
    ],
  },
}
