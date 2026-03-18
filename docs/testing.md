# Manual Testing Guide

This guide walks through how to manually test every major feature of the framework end-to-end.

---

## Prerequisites

Build the plugin first:

```sh
cd /path/to/@jasonshimmy/vite-plugin-cer-app
npm install
npm run build
```

All examples below assume the plugin is built and either globally installed or linked.

---

## 1. Scaffold and verify all three modes

### Create one app per mode

```sh
node dist/cli/create/index.js my-spa  --mode spa
node dist/cli/create/index.js my-ssr  --mode ssr
node dist/cli/create/index.js my-ssg  --mode ssg
```

In each directory, install dependencies and link the plugin:

```sh
cd my-spa && npm install && npm link /path/to/@jasonshimmy/vite-plugin-cer-app
```

### Start the dev server

```sh
npm run dev   # opens http://localhost:3000
```

**Expected:** Browser shows the scaffolded welcome page with the project name. No console errors.

### Build and preview

```sh
npm run build
npm run preview
```

| Mode | Preview URL | Expected |
|---|---|---|
| SPA | `http://localhost:4173` | Index page loads, client-side routing works |
| SSR | `http://localhost:4173` | Full HTML in `view-source:` (no empty `<div>`) |
| SSG | `http://localhost:4173` | Same as SSR; `dist/index.html` exists on disk |

---

## 2. Test file-based routing

In any scaffolded app, add pages incrementally and verify route registration.

### Static route

```sh
echo "component('page-about', () => html\`<h1>About</h1>\`)" > app/pages/about.ts
```

1. While dev server is running, open `http://localhost:3000/about`
2. **Expected:** Page renders. HMR full-reloads automatically when the file is created.

### Dynamic route

```sh
mkdir -p app/pages/blog
cat > app/pages/blog/[slug].ts << 'EOF'
component('page-blog-slug', () => {
  const props = useProps({ slug: '' })
  return html`<h1>Post: ${props.slug}</h1>`
})
EOF
```

1. Navigate to `http://localhost:3000/blog/hello-world`
2. **Expected:** Page renders with `Post: hello-world`

### Catch-all / 404

```sh
echo "component('page-all', () => html\`<h1>404</h1>\`)" > app/pages/\[...all\].ts
```

1. Navigate to `http://localhost:3000/this-does-not-exist`
2. **Expected:** 404 page renders

### Route group

```sh
mkdir -p "app/pages/(auth)"
echo "component('page-login', () => html\`<h1>Login</h1>\`)" > "app/pages/(auth)/login.ts"
```

1. Navigate to `http://localhost:3000/login` (not `/auth/login`)
2. **Expected:** Login page renders at the correct URL

---

## 3. Test layouts

```sh
cat > app/layouts/minimal.ts << 'EOF'
component('layout-minimal', () => {
  return html`<div class="minimal"><slot></slot></div>`
})
EOF
```

Add to a page:

```ts
// app/pages/about.ts
component('page-about', () => html`<h1>About</h1>`)

export const meta = { layout: 'minimal' }
```

**Expected:** The about page is wrapped in `.minimal` without the default header/footer.

To verify layout switching works:
1. Navigate between a page using `default` layout and one using `minimal`
2. **Expected:** No full-page flash; only the `<slot>` content changes

---

## 4. Test auto-imports

Create a page that uses runtime identifiers without any import statement:

```ts
// app/pages/counter.ts
component('page-counter', () => {
  const count = ref(0)

  return html`
    <div>
      <p>Count: ${count}</p>
      <button @click="${() => count.value++}">+</button>
    </div>
  `
})
```

**Expected:** Page works without any `import` statement at the top. The dev server transforms the file to inject imports automatically.

To inspect the injection, check the network tab in DevTools — the transformed file will have `import { component, html, ref, ... }` prepended.

---

## 5. Test components

```sh
cat > app/components/my-badge.ts << 'EOF'
component('my-badge', () => {
  const props = useProps({ text: '', color: 'blue' })
  return html`<span style="background:${props.color};color:white;padding:2px 6px;border-radius:4px">${props.text}</span>`
})
EOF
```

Use it in any page (no import needed):

```ts
// app/pages/index.ts
component('page-index', () => {
  return html`<h1>Hello <my-badge text="World" color="green"></my-badge></h1>`
})
```

**Expected:** Badge renders inline on the home page.

---

## 6. Test composables

```sh
cat > app/composables/useGreeting.ts << 'EOF'
export function useGreeting(name: string) {
  return `Hello, ${name}!`
}
EOF
```

```ts
// app/pages/index.ts
import { useGreeting } from 'virtual:cer-composables'

component('page-index', () => {
  const greeting = useGreeting('World')
  return html`<h1>${greeting}</h1>`
})
```

**Expected:** Page shows "Hello, World!"

---

## 7. Test plugins

```sh
cat > app/plugins/01.greeting.ts << 'EOF'
export default {
  name: 'greeting',
  setup(app) {
    app.provide('greeting', 'Hello from a plugin!')
  },
}
EOF
```

Use in a page:

```ts
// app/pages/index.ts
component('page-index', () => {
  const greeting = inject('greeting')
  return html`<p>${greeting}</p>`
})
```

**Expected:** Page shows the injected string.

---

## 8. Test route middleware

```sh
cat > app/middleware/auth.ts << 'EOF'
export default (to, from, next) => {
  const isLoggedIn = !!localStorage.getItem('token')
  if (!isLoggedIn) {
    next('/login')
  } else {
    next()
  }
}
EOF
```

Assign to a page:

```ts
// app/pages/dashboard.ts
component('page-dashboard', () => html`<h1>Dashboard</h1>`)
export const meta = { middleware: ['auth'] }
```

**Testing steps:**

1. Navigate to `http://localhost:3000/dashboard` without a `token` in localStorage
2. **Expected:** Redirected to `/login`
3. In DevTools console: `localStorage.setItem('token', 'abc')`
4. Navigate back to `/dashboard`
5. **Expected:** Dashboard page renders

---

## 9. Test server API routes

```sh
mkdir -p server/api
cat > server/api/health.ts << 'EOF'
export const GET = (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
}
EOF
```

1. Start the dev server: `npm run dev`
2. Open `http://localhost:3000/api/health`
3. **Expected:** `{"status":"ok","time":"..."}` in the browser

Test a dynamic route:

```sh
cat > server/api/echo/[msg].ts << 'EOF'
export const GET = (req, res) => {
  res.json({ echo: req.params.msg, query: req.query })
}
EOF
```

1. Open `http://localhost:3000/api/echo/hello?foo=bar`
2. **Expected:** `{"echo":"hello","query":{"foo":"bar"}}`

Test a POST handler:

```sh
curl -X POST http://localhost:3000/api/health \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}'
```

(If no POST handler is defined, nothing responds — add one to verify.)

---

## 10. Test server middleware

```sh
cat > server/middleware/cors.ts << 'EOF'
export default (req, res, next) => {
  res.setHeader('X-Test-Header', 'middleware-works')
  next()
}
EOF
```

1. Make any request (e.g. `curl -i http://localhost:3000/api/health`)
2. **Expected:** Response headers include `X-Test-Header: middleware-works`

---

## 11. Test `useHead()`

```ts
// app/pages/about.ts
import { useHead } from '@jasonshimmy/vite-plugin-cer-app/composables'

component('page-about', () => {
  useHead({
    title: 'About — My App',
    meta: [
      { name: 'description', content: 'About page description' },
    ],
  })
  return html`<h1>About</h1>`
})
```

**Client mode (SPA/dev):**
1. Navigate to `/about`
2. **Expected:** Browser tab title changes to "About — My App"; DevTools → Elements → `<head>` contains the meta tag

**SSR mode:**
1. View source of the SSR response (`curl http://localhost:3000/about | head -30`)
2. **Expected:** `<title>About — My App</title>` and `<meta name="description">` appear inside `<head>` in the raw HTML

---

## 12. Test SSR mode end-to-end

```sh
cd my-ssr
npm run build
```

Inspect the output:

```sh
ls dist/
# client/  server/

node -e "
const { handler } = await import('./dist/server/server.js')
const http = await import('node:http')
http.createServer(handler).listen(3001, () => console.log('http://localhost:3001'))
" --input-type=module
```

1. Open `http://localhost:3001`
2. **Expected:** Full page HTML served (view-source shows rendered content, not empty shell)
3. JavaScript hydrates client-side after load

---

## 13. Test SSG mode

```sh
cd my-ssg
npm run generate
# or: npm run build (SSG mode)
```

Inspect output:

```sh
ls dist/
# index.html  client/  server/  ssg-manifest.json

cat dist/ssg-manifest.json
# { "generatedAt": "...", "paths": ["/"], "errors": [] }

cat dist/index.html | head -20
# Full rendered HTML
```

Add a dynamic page with `ssg.paths`:

```ts
// app/pages/items/[id].ts
component('page-items-id', () => {
  const props = useProps({ id: '' })
  return html`<h1>Item ${props.id}</h1>`
})

export const meta = {
  ssg: {
    paths: async () => [
      { params: { id: '1' } },
      { params: { id: '2' } },
      { params: { id: '3' } },
    ],
  },
}
```

Run `npm run generate` again:

```sh
ls dist/items/
# 1/  2/  3/

cat dist/items/1/index.html  # should contain "Item 1"
```

---

## 14. Run the automated test suite

The framework ships with 211 unit and integration tests:

```sh
cd /path/to/@jasonshimmy/vite-plugin-cer-app
npm test
```

Run with coverage report:

```sh
npm run test:coverage
```

Run in watch mode during development:

```sh
npm run test:watch
```

---

## Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot find module 'virtual:cer-routes'` | Plugin not in Vite config | Add `cerApp()` to `vite.config.ts` plugins |
| Page not found after adding a file | HMR did not trigger | Save the file again or restart dev server |
| `component is not defined` | Auto-import not running | Check `autoImports.runtime: true` in config; ensure file is in `app/pages/` |
| SSR renders blank page | `entry-server.ts` not found | Ensure `app/entry-server.ts` exists or let the framework generate it |
| API route returns 404 in dev | File not in `server/api/` | Confirm path is `server/api/` (at project root, not inside `app/`) |
| SSG build skips dynamic routes | `meta.ssg.paths` not exported | Export `meta.ssg.paths` from the page file |
| Layout not applied | `meta.layout` name mismatch | Ensure the value matches the layout filename without extension |
