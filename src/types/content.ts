/** Heading extracted from Markdown during parsing. The `id` is slugified from the heading text and added as an HTML `id` attribute. */
export interface ContentHeading {
  depth: 1 | 2 | 3 | 4 | 5 | 6
  /** Slugified heading text — matches the `id` attribute in the rendered body HTML. */
  id: string
  /** Plain text of the heading. */
  text: string
}

/**
 * Lean per-document metadata — returned by `.find()` and `.count()`.
 * Kept small deliberately: no `body`, no `toc`, no `excerpt`.
 * Use `description` for listing previews; set it in frontmatter.
 */
export interface ContentMeta {
  /** URL path (e.g. `"/blog/hello"`). */
  _path: string
  /** Source file type. */
  _type: 'markdown' | 'json'
  title?: string
  /** Use for listing previews — included in search index. */
  description?: string
  date?: string
  draft?: boolean
  /** Any other frontmatter key. */
  [key: string]: unknown
}

/**
 * Full document — returned by `.first()`.
 * Superset of `ContentMeta`; includes `body`, `toc`, `_file`, and optional `excerpt`.
 */
export interface ContentItem extends ContentMeta {
  /** Relative path from `content/` at the project root (e.g. `"blog/hello.md"`). */
  _file: string
  /** Rendered HTML (Markdown) or the raw file contents (JSON files). */
  body: string
  /** Extracted headings. Empty array for JSON files. */
  toc: ContentHeading[]
  /** HTML content before `<!-- more -->`. Absent when the marker is not present. */
  excerpt?: string
}

/**
 * Search result item returned by `useContentSearch()`.
 * Contains only the MiniSearch stored fields: `_path`, `title`, `description`.
 */
export interface ContentSearchResult {
  _path: string
  title: string
  description?: string
}

/** Content layer configuration. Controls the directory and draft behaviour. */
export interface CerContentConfig {
  /**
   * Content directory relative to the project root. Defaults to `'content'`,
   * which resolves to `{root}/content/` — at the same level as `app/`, `server/`, and `public/`.
   */
  dir?: string
  /**
   * When `true`, draft items (`draft: true` in frontmatter) are included in
   * production builds. Defaults to `false`.
   */
  drafts?: boolean
}
