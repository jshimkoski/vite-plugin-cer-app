// Session API endpoints — used by e2e tests to verify useSession() round-trips.
//
//   GET    /api/session  → { userId: string | null }
//   POST   /api/session  → creates a session with userId = 'test-user'
//   DELETE /api/session  → clears the session
import { useSession } from '@jasonshimmy/vite-plugin-cer-app/composables'

export const GET = async (_req: any, res: any) => {
  const session = useSession<{ userId: string }>()
  const data = await session.get()
  res.json({ userId: data?.userId ?? null })
}

export const POST = async (_req: any, res: any) => {
  const session = useSession<{ userId: string }>()
  await session.set({ userId: 'test-user' })
  res.json({ ok: true })
}

export const DELETE = async (_req: any, res: any) => {
  await useSession().clear()
  res.json({ ok: true })
}
