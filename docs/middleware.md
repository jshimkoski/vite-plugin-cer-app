# Middleware

The framework has two kinds of middleware:

1. **Route middleware** — runs in the browser before navigation (auth guards, redirects)
2. **Server middleware** — runs on the server for every HTTP request (CORS, logging)

---

## Route middleware

### Defining global middleware

Create a file in `app/middleware/`. It runs before every route navigation:

```ts
// app/middleware/auth.ts
import type { RouteMiddleware } from 'vite-plugin-cer-app/types'

const auth: RouteMiddleware = async (to, from, next) => {
  const session = await getSession()
  if (!session) {
    next('/login')   // redirect
  } else {
    next()           // allow navigation
  }
}

export default auth
```

### `RouteMiddleware` signature

```ts
type NextFunction = (redirectTo?: string) => void

type RouteMiddleware = (
  to: Route,
  from: Route | null,
  next: NextFunction,
) => void | Promise<void>
```

Call `next()` to allow navigation, or `next('/path')` to redirect.

---

### Assigning middleware to a specific page

Set `meta.middleware` to an array of middleware names. The name is the filename without the extension:

```ts
// app/pages/dashboard.ts
export const meta = {
  middleware: ['auth'],   // runs app/middleware/auth.ts before this page
}
```

Named middleware runs in addition to any global middleware.

---

### Multiple middleware

```ts
// app/pages/admin.ts
export const meta = {
  middleware: ['auth', 'admin-role'],
  // Runs: auth → admin-role → page
}
```

---

### All middleware files

All files in `app/middleware/` are registered and available by name. They are exported from `virtual:cer-middleware`:

```ts
import middleware from 'virtual:cer-middleware'
// { auth: [Function], 'admin-role': [Function], ... }
```

---

## Server middleware

Server middleware runs on the HTTP level — before API routes and before SSR rendering. Place files in `server/middleware/`.

```ts
// server/middleware/cors.ts
import type { ServerMiddleware } from 'vite-plugin-cer-app/types'

const cors: ServerMiddleware = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return  // do NOT call next() — response is complete
  }

  next()
}

export default cors
```

### `ServerMiddleware` signature

```ts
type ServerMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void | Promise<void>
```

Call `next()` to pass the request to the next handler. If you do not call `next()`, the middleware chain stops and subsequent handlers (API routes, SSR) will not run.

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
