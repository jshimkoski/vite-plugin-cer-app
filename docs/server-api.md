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

## Virtual module

The route map is available via `virtual:cer-server-api`:

```ts
import apiRoutes from 'virtual:cer-server-api'
// [{ path: '/api/users', handlers: { get: [Function], post: [Function] } }, ...]
```
