# Server API Routes

Files in `server/api/` define HTTP endpoint handlers. The same file-to-path rules used for pages apply here, with an `/api/` prefix prepended to every route.

---

## Defining handlers

Export one function per HTTP method. Method names must be uppercase:

```ts
// server/api/users/index.ts  →  GET /api/users, POST /api/users
import type { ApiHandler } from '@jasonshimmy/vite-plugin-cer-app/types'

export const GET: ApiHandler = async (req, res) => {
  const users = await db.user.findAll()
  res.json(users)
}

export const POST: ApiHandler = async (req, res) => {
  const user = await db.user.create(req.body)
  res.status(201).json(user)
}
```

```ts
// server/api/users/[id].ts  →  GET/PUT/DELETE /api/users/:id
export const GET: ApiHandler = async (req, res) => {
  const user = await db.user.findById(req.params.id)
  if (!user) return res.status(404).json({ error: 'Not found' })
  res.json(user)
}

export const PUT: ApiHandler = async (req, res) => {
  const updated = await db.user.update(req.params.id, req.body)
  res.json(updated)
}

export const DELETE: ApiHandler = async (req, res) => {
  await db.user.delete(req.params.id)
  res.status(204).end()
}
```

---

## File → path mapping

| File | API path |
|---|---|
| `server/api/health.ts` | `/api/health` |
| `server/api/users/index.ts` | `/api/users` |
| `server/api/users/[id].ts` | `/api/users/:id` |
| `server/api/posts/[postId]/comments.ts` | `/api/posts/:postId/comments` |

The same transformation rules as page routing apply: `[param]` → `:param`, `index.ts` → strip segment.

---

## `ApiHandler` signature

```ts
type ApiHandler = (req: ApiRequest, res: ApiResponse) => void | Promise<void>
```

### `ApiRequest` (extends `IncomingMessage`)

```ts
interface ApiRequest extends IncomingMessage {
  params: Record<string, string>   // URL path params, e.g. { id: '42' }
  query: Record<string, string>    // Parsed query string, e.g. { page: '1' }
  body: unknown                    // Parsed JSON body (POST/PUT/PATCH only)
}
```

### `ApiResponse` (extends `ServerResponse`)

```ts
interface ApiResponse extends ServerResponse {
  json(data: unknown): void         // Set Content-Type: application/json and send
  status(code: number): ApiResponse // Set status code, chainable
}
```

---

## Error handling

Unhandled errors thrown inside a handler are caught and return a 500 JSON response:

```json
{ "error": "Internal Server Error" }
```

For custom error responses, handle errors yourself:

```ts
export const GET: ApiHandler = async (req, res) => {
  try {
    const result = await riskyOperation()
    res.json(result)
  } catch (err) {
    res.status(503).json({ error: 'Service unavailable', message: String(err) })
  }
}
```

---

## Reading the request body

For `POST`, `PUT`, and `PATCH` requests with `Content-Type: application/json`, the body is automatically parsed and available as `req.body`:

```ts
export const POST: ApiHandler = async (req, res) => {
  const { name, email } = req.body as { name: string; email: string }
  // ...
}
```

For other content types, `req.body` is the raw `Buffer`.

---

## Query parameters

Query string parameters are parsed and available as `req.query`:

```ts
// GET /api/users?page=2&limit=10
export const GET: ApiHandler = async (req, res) => {
  const page = parseInt(req.query.page ?? '1')
  const limit = parseInt(req.query.limit ?? '20')
  // ...
}
```

---

## Default handler (method-agnostic)

Export a `default` function to handle any HTTP method that does not have a named handler:

```ts
// server/api/webhook.ts
export default async function handler(req, res) {
  // Handles any method not explicitly exported
  res.json({ received: true })
}
```

---

## Where API routes are registered

| Environment | Registration |
|---|---|
| **Dev** | Vite `configureServer` middleware — active immediately, hot-reloaded |
| **SSR production** | Exported from `dist/server/server.js` alongside the SSR handler |
| **SPA production** | Not included — deploy API routes separately or use a proxy |
| **SSG production** | Optionally called at build time for data; otherwise deployed separately |

### SPA mode — by design

In SPA mode (`mode: 'spa'`) the build output is a pure client bundle with no server component. API routes defined in `server/api/` are **only active during development** (Vite dev server middleware). At runtime the SPA has no server to serve them from.

Options for SPA + API:
- **Separate API server** — deploy a Node.js/Express server alongside the SPA that mounts the same `server/api/` handlers.
- **Reverse proxy** — proxy `/api/*` requests from your CDN or web server to a backend service.
- **Switch to SSR mode** — `mode: 'ssr'` gives you a full Node.js server that serves both the SSR pages and the API routes from a single process.

---

## Using composables in API handlers

Files in `server/api/` are **not** covered by the auto-import transform (unlike `app/pages/`, `app/layouts/`, etc.). To use framework composables such as `useCookie` or `useSession`, import them explicitly:

```ts
// server/api/session.ts
import { useSession } from '@jasonshimmy/vite-plugin-cer-app/composables'

export const GET: ApiHandler = async (_req, res) => {
  const session = useSession<{ userId: string }>()
  const data = await session.get()
  res.json({ userId: data?.userId ?? null })
}

export const POST: ApiHandler = async (_req, res) => {
  const session = useSession<{ userId: string }>()
  await session.set({ userId: 'user-123' })
  res.json({ ok: true })
}
```

```ts
// server/api/prefs.ts
import { useCookie } from '@jasonshimmy/vite-plugin-cer-app/composables'

export const POST: ApiHandler = async (_req, res) => {
  const theme = useCookie('theme')
  theme.set('dark', { path: '/', maxAge: 31536000 })
  res.json({ ok: true })
}
```

`useCookie` and `useSession` read and write HTTP headers through the per-request `AsyncLocalStorage` context, which the framework sets up automatically before calling each API handler.

---

## Custom server integration

When integrating the server bundle with a custom Node.js server (Express, Fastify, Hono, etc.) instead of the built-in adapters, wrap each API handler call with `runWithRequestContext` so that composables like `useCookie` and `useSession` have access to the current `req`/`res`:

```ts
// Express custom server
import express from 'express'
import { handler, apiRoutes, runWithRequestContext } from './dist/server/server.js'

const app = express()

app.all('/api/*', async (req, res) => {
  for (const route of apiRoutes) {
    const params = matchApiPattern(route.path, req.path)
    if (params) {
      req.params = params
      const fn = route.handlers[req.method.toLowerCase()] ?? route.handlers.default
      if (fn) {
        await runWithRequestContext(req, res, () => fn(req, res))
        return
      }
    }
  }
  res.status(404).send('Not Found')
})

app.use((req, res) => handler(req, res))
app.listen(3000)
```

`runWithRequestContext(req, res, fn)` runs `fn` inside the per-request `AsyncLocalStorage` context. Without it, `useCookie`, `useSession`, and other server-side composables cannot access the current request or response.

> The built-in preview server and all platform adapters (Vercel, Netlify, Cloudflare) call `runWithRequestContext` automatically — you only need this when building a custom integration.

---

## Virtual module

The route map is available via `virtual:cer-server-api`:

```ts
import apiRoutes from 'virtual:cer-server-api'
// [{ path: '/api/users', handlers: { get: [Function], post: [Function] } }, ...]
```
