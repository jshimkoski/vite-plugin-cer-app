import { posts } from '../../data/posts'

export const GET = (_req: any, res: any) => {
  res.json(posts)
}
