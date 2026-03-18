# Layouts

Layouts wrap page content in a shared shell — header, footer, navigation, etc. They live in `app/layouts/` and use `<slot>` to inject the page.

---

## Defining a layout

```ts
// app/layouts/default.ts
component('layout-default', () => {
  return html`
    <header>
      <nav>
        <router-link to="/">Home</router-link>
        <router-link to="/about">About</router-link>
      </nav>
    </header>
    <main>
      <slot></slot>
    </main>
    <footer>
      <p>© 2025 My App</p>
    </footer>
  `
})
```

The `<slot>` is where the current page's output is injected.

---

## Naming conventions

| File | Layout name | Custom element tag |
|---|---|---|
| `app/layouts/default.ts` | `'default'` | `layout-default` |
| `app/layouts/minimal.ts` | `'minimal'` | `layout-minimal` |
| `app/layouts/blog/post.ts` | `'blog-post'` | `layout-blog-post` |

The **layout name** (the key in the map) is the path relative to `app/layouts/`, with slashes replaced by dashes and the extension stripped:
- `default.ts` → `'default'`
- `blog/post.ts` → `'blog-post'`

The **tag name** is `layout-` prefixed:
- `default.ts` → `layout-default`
- `blog/post.ts` → `layout-blog-post`

---

## Assigning a layout to a page

Set `meta.layout` in any page file:

```ts
// app/pages/about.ts
component('page-about', () => html`<h1>About</h1>`)

export const meta = {
  layout: 'default',   // uses app/layouts/default.ts
}
```

If `meta.layout` is omitted and `app/layouts/default.ts` exists, the default layout is used automatically.

To render a page without any layout, explicitly set `layout` to an empty string or `false`:

```ts
export const meta = {
  layout: '',  // no layout
}
```

---

## Multiple layouts

You can have as many layout files as needed:

```
app/layouts/
  default.ts      # full-page layout (header + footer)
  minimal.ts      # no header/footer (used for login, error pages)
  dashboard.ts    # sidebar + main area
```

Choose per page:

```ts
// app/pages/(auth)/login.ts
export const meta = { layout: 'minimal' }

// app/pages/dashboard/index.ts
export const meta = { layout: 'dashboard' }
```

---

## Accessing layouts in code

The layout map is available via `virtual:cer-layouts`:

```ts
import layouts from 'virtual:cer-layouts'
// { default: 'layout-default', minimal: 'layout-minimal', ... }
```

---

## Layout switching and DOM preservation

When navigating between pages with different layouts, the framework uses `<cer-keep-alive>` to preserve the layout DOM and avoid unnecessary teardown/remount cycles. This means transitions between pages sharing the same layout are smooth with no layout flash.
