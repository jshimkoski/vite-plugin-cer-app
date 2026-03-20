import { posts } from '../../data/posts'

export const GET = (req: any, res: any) => {
  const { slug } = req.params
  const post = posts.find((p) => p.slug === slug)
  if (!post) {
    res.statusCode = 404
    return res.json({ error: 'Not found' })
  }
  res.json(post)
}
