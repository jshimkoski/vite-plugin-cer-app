# Middleware

The framework has two kinds of middleware:

1. **Route middleware** — runs in the browser before navigation (auth guards, redirects)
2. **Server middleware** — runs on the server for every HTTP request (CORS, logging)

---

## Route middleware

### Defining middleware

Create a file in `app/middleware/`. Export a default `MiddlewareFn` using `defineMiddleware`:

```ts
// app/middleware/auth.ts
export default defineMiddleware(async (to, from) => {
  const session = await getSession()
  if (!session) return '/login'  // redirect
  return true                    // allow navigation
})
```

`defineMiddleware` is a no-op identity helper — it just provides TypeScript types without
any runtime overhead. It is auto-imported, so you don't need to import it manually.

### `MiddlewareFn` signature

```ts
type GuardResult = boolean | string | Promise<boolean | string>

type MiddlewareFn = (to: RouteState, from: RouteState | null) => GuardResult
```

| Return value | Effect |
|---|---|
| `true` | Allow navigation |
| `false` | Block navigation (stay on current route) |
| `string` | Redirect to that path |

---

### Assigning middleware to a specific page

Set `meta.middleware` to an array of middleware names. The name is the filename without the extension:

```ts
// app/pages/dashboard.ts
export const meta = {
  middleware: ['auth'],   // runs app/middleware/auth.ts before this page
}
```

---

### Multiple middleware

Middleware runs in the order listed. The first non-`true` result wins:

```ts
// app/pages/admin.ts
export const meta = {
  middleware: ['auth', 'admin-role'],
  // Runs: auth → admin-role → page render
}
```

---

### Execution order within a navigation

1. `beforeEnter` fires on the matched route — runs all declared middleware in order
2. Route state updates (component renders)
3. `afterEnter` fires (analytics, logging)

Redirect loop protection: the router stops after 10 consecutive redirects.

---

### Error handling

If a middleware function throws (synchronously or asynchronously), navigation is **blocked** — the framework catches the error, logs it, and returns `false` to keep the user on the current route:

```
[cer-app] Middleware "auth" threw an error: Error: session store unavailable
```

This means a crashing middleware is always safe: the user stays put rather than landing on a broken page or being incorrectly redirected. Subsequent middleware in the same chain does not run.

---

### TypeScript types

`MiddlewareFn` and `GuardResult` are exported from the package if you need them outside of auto-imported files:

```ts
import type { MiddlewareFn, GuardResult } from '@jasonshimmy/vite-plugin-cer-app/types'
```

---

### All middleware files

All files in `app/middleware/` are registered and available by name. They are exported from `virtual:cer-middleware`:

```ts
import { middleware } from 'virtual:cer-middleware'
// { auth: [Function], 'admin-role': [Function], ... }
```

---

## Server middleware

Server middleware runs on the HTTP level — before API routes and before SSR rendering. Place files in `server/middleware/`.

```ts
// server/middleware/cors.ts
// defineServerMiddleware is auto-imported — no import statement needed
export default defineServerMiddleware((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return  // do NOT call next() — response is complete
  }

  next()
})
```

If you need it outside `server/middleware/` files, import explicitly:

```ts
import { defineServerMiddleware } from '@jasonshimmy/vite-plugin-cer-app/composables'
```

### `ServerMiddleware` signature

```ts
type ServerMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void | Promise<void>
```

- Call `next()` to pass the request to the next handler.
- Call `next(err)` with an error to short-circuit the chain and send a `500` response.
- Throw (synchronously or via a rejected Promise) to produce the same result as `next(err)` — the chain stops and a `500` is returned.
- If you do not call `next()` at all (e.g. you called `res.end()`), the chain stops and subsequent handlers (API routes, SSR) will not run.

---

### Dev server behavior

Server middleware is applied in dev via Vite's `configureServer` middleware hook, before API routes and before the SSR HTML renderer.

In production (SSR mode), server middleware is exported from the server bundle and applied in the same order.

---

### Execution order

For each request, the order is:

1. Server middleware (from `server/middleware/`, in scan order)
2. API route handlers (from `server/api/`)
3. SSR HTML renderer (if `mode === 'ssr'` and the request accepts `text/html`)
4. Vite dev server (dev only — serves assets and handles HMR)
