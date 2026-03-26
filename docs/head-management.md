# Head Management

The `useHead()` composable manages `<title>`, `<meta>`, `<link>`, `<script>`, and `<style>` tags in the document `<head>`.

- **In SSR/SSG mode** — tags are collected during rendering and injected into the HTML before it is sent to the browser.
- **In client mode (SPA or after hydration)** — tags are imperatively applied to `document.head`.

---

## Import

`useHead` is auto-imported in files inside `app/pages/`, `app/layouts/`, `app/components/`, and root convention files (e.g. `app/loading.ts`). No import statement is needed in those locations.

If you use `useHead` outside those directories, import it explicitly:

```ts
import { useHead } from '@jasonshimmy/vite-plugin-cer-app/composables'
```

---

## Basic usage

```ts
component('page-about', () => {
  useHead({
    title: 'About Us',
    meta: [
      { name: 'description', content: 'Learn more about our team.' },
      { property: 'og:title', content: 'About Us' },
      { property: 'og:type', content: 'website' },
    ],
    link: [
      { rel: 'canonical', href: 'https://example.com/about' },
    ],
  })

  return html`<h1>About</h1>`
})
```

---

## `HeadInput` interface

```ts
interface HeadInput {
  title?: string
  meta?: Array<Record<string, string>>
  link?: Array<Record<string, string>>
  script?: Array<Record<string, string>>
  style?: Array<Record<string, string>>
}
```

All fields are optional. Each array item is a map of HTML attribute names to values. Use `innerHTML` as a special key to set element inner content for `<script>` and `<style>`.

---

## Title

```ts
useHead({ title: 'My Page' })
```

- **SSR/SSG:** Rendered as `<title>My Page</title>` injected before `</head>`.
- **Client:** Sets `document.title = 'My Page'`.
- **Deduplication:** Last call wins — subsequent `useHead({ title })` calls overwrite the previous title.

HTML entities in the title are escaped automatically (`<`, `>`, `&`).

---

## Meta tags

```ts
useHead({
  meta: [
    { name: 'description', content: 'Page description' },
    { property: 'og:title', content: 'OG Title' },
    { charset: 'UTF-8' },
    { name: 'robots', content: 'index, follow' },
  ],
})
```

### Deduplication

Meta tags are deduplicated by their key attribute:

| Attribute present | Dedup key |
|---|---|
| `name` | `name` value |
| `property` | `property` value |
| `charset` | `charset` value |
| None of the above | Full JSON serialization |

When the same key is set twice, the later value replaces the earlier one.

### Client mode

- If a `meta[name="…"]` or `meta[property="…"]` element already exists in the DOM, its attributes are updated in place.
- Otherwise a new `<meta>` element is created and appended to `<head>`.
- `charset` meta tags are **not** updated on the client (the `name`/`property` check requires one of those attributes).

---

## Link tags

```ts
useHead({
  link: [
    { rel: 'canonical', href: 'https://example.com/about' },
    { rel: 'stylesheet', href: '/styles/extra.css' },
    { rel: 'preload', href: '/fonts/inter.woff2', as: 'font', type: 'font/woff2', crossorigin: '' },
  ],
})
```

### Deduplication

Deduplicated by `rel` + `href` key. Same `rel`/`href` pair appearing twice results in a single tag.

### Client mode

- If a `link[rel="…"][href="…"]` already exists, its attributes are updated in place.
- Otherwise a new `<link>` element is created.

---

## Script tags

```ts
useHead({
  script: [
    // External script by src
    { src: '/analytics.js', defer: '', type: 'text/javascript' },

    // Inline script with innerHTML
    { innerHTML: 'window.__APP_VERSION__ = "1.0.0"' },

    // JSON-LD structured data
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'About Us',
      }),
    },
  ],
})
```

Script tags are **not** deduplicated — every call appends a new `<script>` to the output.

### Client mode (script deduplication)

On the client, scripts **with `src`** are deduplicated: a `<script src="…">` is only added if no `script[src="…"]` already exists in the DOM. Scripts without `src` (inline) are always appended.

---

## Style tags

```ts
useHead({
  style: [
    { innerHTML: ':root { --color-primary: #007bff }' },
    { type: 'text/css', innerHTML: 'body { margin: 0 }' },
  ],
})
```

Style tags are not deduplicated.

> **Note:** `style` tag support via `useHead` is SSR/SSG only. Client-side `useHead({ style: [...] })` calls are no-ops — style tags are not injected into `document.head` on the client.

---

## SSR: collection and injection

During SSR rendering, `useHead()` calls are collected via a request-scoped array. After rendering is complete, the collected tags are serialized and injected before `</head>` in the HTML shell.

You can use the underlying primitives directly from `@jasonshimmy/vite-plugin-cer-app/composables` if you need manual control:

```ts
import { beginHeadCollection, endHeadCollection, serializeHeadTags } from '@jasonshimmy/vite-plugin-cer-app/composables'

// Before rendering:
beginHeadCollection()

// ... render component tree (useHead() calls accumulate) ...

// After rendering:
const collected = endHeadCollection()
const headHtml = serializeHeadTags(collected)
// Inject headHtml into your HTML template
```

---

## Merging rules summary

| Tag type | Deduplication key | Merge behavior |
|---|---|---|
| `<title>` | N/A | Last wins |
| `<meta name>` | `name` value | Later replaces earlier |
| `<meta property>` | `property` value | Later replaces earlier |
| `<meta charset>` | `charset` value | Later replaces earlier |
| `<link>` | `rel` + `href` | Later replaces earlier |
| `<script>` | None (SSR) / `src` (client) | Accumulated (external deduped on client) |
| `<style>` | None | Always accumulated |
