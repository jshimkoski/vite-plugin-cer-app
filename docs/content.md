# Content Layer

CER Content is a file-based content layer built into `vite-plugin-cer-app`. It parses Markdown and JSON files from `content/` at the project root, injects them into the global store, generates a static search index, and exposes them to your pages via `queryContent()` and `useContentSearch()`. No separate server or database is required.

---

## Overview

- **Zero config** — drop files into `content/` at the project root and they are available immediately.
- **Markdown + JSON** — Markdown files are parsed with frontmatter, rendered to HTML, and have their headings extracted into a table of contents. JSON files are stored as raw string bodies.
- **Draft support** — items with `draft: true` in frontmatter are excluded from production builds by default.
- **Excerpt extraction** — place `<!-- more -->` in a Markdown file to set the excerpt boundary.
- **Full-text search** — a MiniSearch index is emitted at build time and loaded lazily on the client via `useContentSearch()`.
- **Works in all modes** — SPA (client fetch), SSR (Node.js filesystem), and SSG (pre-rendered).

---

## Quick start

### 1. Enable the content layer

```ts
// cer.config.ts
import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  content: {},
})
```

### 2. Add content files

```
content/
  index.md
  blog/
    2026-04-01-hello.md
  docs/
    getting-started.md
```

### 3. Query content in a page

```ts
// app/pages/blog.ts
component('page-blog', () => {
  useHead({ title: 'Blog' })

  const ssrData = usePageData<{ posts: ContentMeta[] }>()
  const posts = ref<ContentMeta[]>(ssrData?.posts ?? [])

  useOnConnected(async () => {
    if (ssrData) return
    posts.value = await queryContent('/blog').find()
  })

  return html`
    <ul>
      ${each(posts.value, p => html`<li><a :href="${p._path}">${p.title}</a></li>`)}
    </ul>
  `
})

export const loader = async () => {
  const posts = await queryContent('/blog').find()
  return { posts }
}
```

---

## Configuration

All options are optional.

```ts
// cer.config.ts
export default defineConfig({
  content: {
    dir: 'content',    // default
    drafts: false,     // default
  },
})
```

### `content.dir`

**Type:** `string`
**Default:** `'content'`

Content directory relative to the **project root** — at the same level as `app/`, `server/`, and `public/`. The default resolves to `{root}/content/`.

### `content.drafts`

**Type:** `boolean`
**Default:** `false`

When `false`, any file with `draft: true` in its frontmatter is excluded from the content store and search index. Set to `true` to include drafts (useful for preview environments).

---

## File format

### Markdown files

Markdown files use [gray-matter](https://github.com/jonschlinkert/gray-matter) for YAML frontmatter. All frontmatter keys are stored in the content item. The body is rendered to HTML using [marked](https://marked.js.org). Heading elements receive an `id` attribute derived from their slug.

```md
---
title: Hello World
description: My first post.
date: 2026-04-01
draft: false
---

# Hello World

<!-- more -->

Everything below the excerpt boundary is in `body` but not in `excerpt`.
```

Recognized frontmatter keys:

| Key | Type | Description |
|---|---|---|
| `title` | `string` | Document title. |
| `description` | `string` | Short description for listings and search. |
| `date` | `string` | ISO date string (e.g. `2026-04-01`). |
| `draft` | `boolean` | When `true`, excluded from production builds unless `drafts: true`. |

Any additional frontmatter keys are stored verbatim in the `ContentMeta` / `ContentItem` object.

### Date-prefixed filenames

Filenames starting with `YYYY-MM-DD-` have the date prefix stripped when computing the content path:

```
content/blog/2026-04-01-hello.md  →  _path: '/blog/hello'
```

### Index files

Files named `index.md` have `/index` stripped from their path:

```
content/blog/index.md  →  _path: '/blog'
content/index.md       →  _path: '/'
```

### JSON files

JSON files are read as-is. The `body` is the result of `JSON.stringify(data)`. The `toc` is always an empty array.

```
content/data/features.json  →  _path: '/data/features', _type: 'json'
```

### Excerpt

Place `<!-- more -->` anywhere in a Markdown file to set the excerpt boundary. Everything before the marker is stored in `item.excerpt` as rendered HTML. The full rendered body (including content after the marker, minus the marker itself) is in `item.body`.

```md
This paragraph is the excerpt.

<!-- more -->

This paragraph is only in the body.
```

---

## TypeScript types

All types are exported from `@jasonshimmy/vite-plugin-cer-app` and are automatically available as globals inside pages, layouts, and components.

```ts
import type {
  ContentMeta,
  ContentItem,
  ContentHeading,
  ContentSearchResult,
  CerContentConfig,
} from '@jasonshimmy/vite-plugin-cer-app'
```

### `ContentMeta`

Lean per-document object returned by `.find()` and `.count()`. Does not include `body`, `toc`, or `excerpt`.

```ts
interface ContentMeta {
  _path: string           // URL path, e.g. '/blog/hello'
  _type: 'markdown' | 'json'
  title?: string
  description?: string
  date?: string
  draft?: boolean
  [key: string]: unknown  // any additional frontmatter key
}
```

### `ContentItem`

Full document returned by `.first()`. Extends `ContentMeta` with rendered body, TOC, and excerpt.

```ts
interface ContentItem extends ContentMeta {
  _file: string               // relative source path, e.g. 'blog/hello.md'
  body: string                // rendered HTML
  toc: ContentHeading[]       // extracted headings
  excerpt?: string            // HTML before <!-- more --> (if marker present)
}
```

### `ContentHeading`

```ts
interface ContentHeading {
  depth: 1 | 2 | 3 | 4 | 5 | 6
  id: string      // slugified heading text, matches id= in body HTML
  text: string    // plain heading text
}
```

### `ContentSearchResult`

```ts
interface ContentSearchResult {
  _path: string
  title: string
  description?: string
}
```

---

## `queryContent(path?)`

**Auto-imported** in pages, layouts, and components.

Returns a `QueryBuilder` scoped to the given path prefix. If `path` is omitted, queries all content.

```ts
queryContent()              // all items
queryContent('/blog')       // items where _path starts with '/blog'
queryContent('/blog/hello') // items where _path starts with '/blog/hello'
```

### `QueryBuilder` methods

All terminal methods return a `Promise`.

#### `.where(predicate)`

Filters results. `predicate` is a function that receives a `ContentMeta` and returns `true` to include the item.

```ts
await queryContent('/blog').where(doc => !doc.draft).find()
await queryContent().where(doc => /^\/docs/.test(doc._path)).find()
await queryContent().where(doc => Array.isArray(doc.tags) && (doc.tags as string[]).includes('web')).find()
```

#### `.sortBy(field, order?)`

Sorts results by a field. `order` defaults to `'asc'`.

```ts
await queryContent('/blog').sortBy('date', 'desc').find()
```

#### `.limit(n)`

Returns at most `n` items.

```ts
await queryContent('/blog').limit(5).find()
```

#### `.skip(n)`

Skips the first `n` items (pagination).

```ts
await queryContent('/blog').skip(10).limit(10).find()
```

#### `.find()`

Executes the query and returns `Promise<ContentMeta[]>`.

```ts
const posts = await queryContent('/blog').sortBy('date', 'desc').find()
```

#### `.first()`

Returns `Promise<ContentItem | null>` — the first matching full document (includes `body`, `toc`, `excerpt`).

When a path is set and no other filters or sort are active, `first()` short-circuits to a direct item lookup for efficiency.

```ts
const doc = await queryContent('/docs/getting-started').first()
if (doc) {
  // doc.body, doc.toc, doc.excerpt
}
```

#### `.count()`

Returns `Promise<number>` — the number of matching items (no body loaded).

```ts
const total = await queryContent().count()
```

### Using with a page loader (SSR/SSG)

```ts
component('page-blog', () => {
  const ssrData = usePageData<{ posts: ContentMeta[] }>()
  const posts = ref<ContentMeta[]>(ssrData?.posts ?? [])

  useOnConnected(async () => {
    if (ssrData) return // already hydrated from loader
    posts.value = await queryContent('/blog').sortBy('date', 'desc').find()
  })

  return html`...`
})

export const loader = async () => {
  const posts = await queryContent('/blog').sortBy('date', 'desc').find()
  return { posts }
}
```

---

## `useContentSearch()`

**Auto-imported** in pages, layouts, and components.

Returns reactive `query` and `results` refs. The MiniSearch index is loaded once on the client (lazily, the first time the composable is used). Search is debounce-free — results update synchronously on each keypress, but the initial index fetch is async.

```ts
const { query, results } = useContentSearch()
```

### Return value

```ts
interface UseContentSearchReturn {
  query: Ref<string>               // bind to an <input> value
  results: Ref<ContentSearchResult[]>  // reactive search results
}
```

### Usage

```ts
component('page-search', () => {
  const { query, results } = useContentSearch()

  return html`
    <input type="search" :model="${query}" placeholder="Search…" />
    <ul>
      ${each(results.value, r => html`
        <li><a :href="${r._path}">${r.title}</a></li>
      `)}
    </ul>
  `
})
```

Search activates when `query.value.length >= 2`. Empty or single-character queries return an empty array.

### Searched fields

The MiniSearch index is built over `title` and `description`. The stored fields (`_path`, `title`, `description`) are returned in each result.

---

## Rendering modes

### SPA mode

On the client, `queryContent()` lazily fetches `/_content/manifest.json` (all `ContentMeta` items) and caches it. Individual full documents (`ContentItem`) are fetched from `/_content/[path].json` on demand (once each, cached).

### SSR mode

During concurrent server renders, `queryContent()` reads synchronously from the in-memory `globalThis.__CER_CONTENT_STORE__` array populated at server startup. No filesystem or network access is needed per request.

At production runtime, if `__CER_CONTENT_STORE__` is absent, the `ContentClient` falls back to reading `dist/_content/` files via `node:fs`.

### SSG mode

During pre-rendering (`cer-app build --mode ssg`), `queryContent()` reads from `globalThis.__CER_CONTENT_STORE__` just like SSR. After all pages are rendered, the `closeBundle` hook writes the content manifest, individual document JSON files, and search index to `dist/_content/`.

---

## Search index

At build time, a `dist/_content/search-index.json` file is written. It is the serialized MiniSearch index for all non-draft content items. The client fetches this file the first time `useContentSearch()` activates a search.

The search index is **not** available in dev mode — the dev server serves `/_content/search-index.json` from the in-memory store using the same MiniSearch serialization.

---

## Dev server

In dev mode, the Vite dev server intercepts all `/_content/*` requests:

| URL pattern | Response |
|---|---|
| `/_content/manifest.json` | JSON array of all `ContentMeta` items |
| `/_content/search-index.json` | Serialized MiniSearch index |
| `/_content/[path].json` | Full `ContentItem` for `_path === path` |

Content files are watched for changes. When a Markdown or JSON file in `content/` changes, the store is re-populated and a full-reload HMR event is dispatched to the client.

---

## Limitations

- **No aggregation** — `.count()` is the only aggregation terminal. Use `.find()` + `Array.prototype.length` for anything more complex.
- **Search fields only** — MiniSearch is configured to index `title` and `description`. Full-body search is not supported.
- **Content directory is fixed at build time** — changing `content.dir` at runtime has no effect.

---

## Known edge cases

- Filenames with multiple `YYYY-MM-DD-` date prefixes have only the leading prefix stripped.
- Markdown files with no headings have an empty `toc` array.
- JSON files with invalid JSON are skipped and a warning is logged to the console. The build continues without that file.
