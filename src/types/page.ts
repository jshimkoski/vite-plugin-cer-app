import type { IncomingMessage } from 'node:http'

/**
 * Controls when the client-side JS activates a pre-rendered page component.
 *
 * - `'load'`    — activate immediately on page load (default).
 * - `'idle'`    — defer until `requestIdleCallback` fires (browser idle time).
 * - `'visible'` — defer until `cer-layout-view` enters the viewport (IntersectionObserver).
 * - `'none'`    — never activate; SSR HTML is served as static markup with no JS.
 */
export type HydrateStrategy = 'load' | 'idle' | 'visible' | 'none'

/** Context object passed to a page's `ssg.paths()` function. Contains resolved route params for one path variant. */
export interface SsgPathsContext {
  params: Record<string, string>
}

/** Per-page SSG / ISR configuration. Export as `export const meta = { ssg: { ... } }` from any page file. */
export interface PageSsgConfig {
  /**
   * Factory that returns the set of param combinations to pre-render for dynamic routes.
   * Required for dynamic routes (e.g. `/posts/[slug]`) — without it the route is skipped
   * during the static build.
   *
   * @example
   * ```ts
   * export const meta = {
   *   ssg: {
   *     paths: async () => {
   *       const slugs = await fetchAllSlugs()
   *       return slugs.map(slug => ({ params: { slug } }))
   *     },
   *   },
   * }
   * ```
   */
  paths?: () => Promise<SsgPathsContext[]> | SsgPathsContext[]
  /**
   * Seconds before a cached SSR response is stale and should be re-rendered.
   * Enables Incremental Static Regeneration (ISR) in the preview server and
   * any production adapter that reads `meta.ssg.revalidate`.
   *
   * @example export const meta = { ssg: { revalidate: 60 } }
   */
  revalidate?: number
}

/**
 * Per-page metadata. Export as `export const meta = { ... }` from any page file.
 * Values are read at build time and embedded into the route manifest.
 */
export interface PageMeta {
  /** Layout component to wrap this page. Must match a file in `app/layouts/`. Defaults to `'default'`. */
  layout?: string
  /** Named middleware files from `app/middleware/` to run before this route activates. */
  middleware?: string[]
  hydrate?: HydrateStrategy
  ssg?: PageSsgConfig
  /**
   * CSS transition name applied to the page during route changes.
   * Set to `true` to use the default 'page' transition name.
   * The framework adds/removes `[data-transition="<name>"]` on the root element
   * so you can target it with CSS animations.
   *
   * @example export const meta = { transition: 'fade' }
   */
  transition?: string | boolean
  /**
   * Per-route rendering strategy. Overrides the global `mode` for this route.
   *
   * - `'server'` — always render server-side, never pre-render. In SSG mode
   *   the route is skipped during the static build.
   * - `'static'` — always serve pre-rendered static HTML. In the SSR preview
   *   server the pre-rendered file is served from disk; falls back to SSR if
   *   not found.
   * - `'spa'`    — client-only. In SSR mode the server returns the SPA shell
   *   (index.html) without rendering. In SSG mode the route is skipped.
   *
   * @example export const meta = { render: 'server' }
   */
  render?: 'static' | 'server' | 'spa'
}

/**
 * Context object passed to a page's `loader` function.
 * Available on the server only — the loader runs before the page component renders.
 */
export interface PageLoaderContext<P extends Record<string, string> = Record<string, string>> {
  params: P
  query: Record<string, string>
  /** Present during SSR/SSG server render. Absent (`undefined`) during client-side navigation. */
  req?: IncomingMessage
}

/**
 * Server-side data loader for a page. Export as `export const loader` (or `export async function loader`)
 * from any page file. The returned object is:
 * - Made available via `usePageData()` inside the page component.
 * - Primitive values are also forwarded as element attributes so `useProps()` works.
 * - Serialized into `window.__CER_DATA__` for client-side hydration.
 *
 * Throwing an error (with an optional `.status` property) renders the page's error component
 * and sets the HTTP response status code.
 *
 * @example
 * ```ts
 * export const loader: PageLoader<{ slug: string }, { post: Post }> = async ({ params }) => {
 *   const post = await fetchPost(params.slug)
 *   if (!post) throw Object.assign(new Error('Not found'), { status: 404 })
 *   return { post }
 * }
 * ```
 */
export type PageLoader<
  P extends Record<string, string> = Record<string, string>,
  D = Record<string, unknown>,
> = (ctx: PageLoaderContext<P>) => Promise<D> | D
