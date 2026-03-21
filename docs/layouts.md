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

---

## 🪆 Nested layouts

Place a `_layout.ts` file inside any page subdirectory to add an inner layout that wraps pages in that subtree. The outer layout (from `meta.layout` or the default) wraps the inner layout, which wraps `<router-view>`.

### File convention

```
app/
  layouts/
    default.ts      # outer layout — full shell (header, footer)
    minimal.ts      # outer layout — bare minimum
    sidebar.ts      # inner layout — adds a sidebar panel
  pages/
    index.ts        # uses 'default' layout only
    admin/
      _layout.ts    # ← inner layout override for all /admin/* pages
      index.ts      # layout chain: ['default', 'sidebar']
      users.ts      # layout chain: ['default', 'sidebar']
      settings.ts   # layout chain: ['default', 'sidebar']
```

### `_layout.ts` syntax

Export the inner layout name as a default string:

```ts
// app/pages/admin/_layout.ts
export default 'sidebar'
```

The value must match a filename (without extension) in `app/layouts/`.

### Rendered structure

For a page at `app/pages/admin/users.ts` with the above setup:

```html
<layout-default>
  <layout-sidebar>
    <router-view></router-view>
  </layout-sidebar>
</layout-default>
```

Each layout receives the inner content via `<slot>`.

### Overriding the outer layout

If a page in a nested subtree needs a different outer layout, declare it in `meta.layout` as usual:

```ts
// app/pages/admin/login.ts
export const meta = {
  layout: 'minimal',   // overrides outer; chain = ['minimal', 'sidebar']
}
```

### Multiple nesting levels

Nesting is resolved recursively. Each ancestor directory that contains a `_layout.ts` contributes one level to the chain:

```
app/pages/
  admin/
    _layout.ts      → 'sidebar'
    settings/
      _layout.ts    → 'settings-tabs'
      profile.ts    # chain: ['default', 'sidebar', 'settings-tabs']
```

### `meta.layoutChain` in routes

The framework emits the resolved chain as `meta.layoutChain` on the route object at build time. You can read it at runtime:

```ts
import routes from 'virtual:cer-routes'
const adminUsers = routes.find(r => r.path === '/admin/users')
// adminUsers.meta.layoutChain → ['default', 'sidebar']
```
