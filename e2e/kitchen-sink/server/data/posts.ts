export interface Post {
  slug: string
  title: string
  excerpt: string
  body: string
}

export const posts: Post[] = [
  {
    slug: 'first-post',
    title: 'First Post',
    excerpt: 'The very first post in the kitchen sink.',
    body: 'First post body content. This was loaded via a page loader.',
  },
  {
    slug: 'second-post',
    title: 'Second Post',
    excerpt: 'The second post in the kitchen sink.',
    body: 'Second post body content. Dynamic routes and loaders work together.',
  },
]
