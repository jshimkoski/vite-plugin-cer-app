import type { IncomingMessage } from 'node:http'

export type HydrateStrategy = 'load' | 'idle' | 'visible' | 'none'

export interface SsgPathsContext {
  params: Record<string, string>
}

export interface PageSsgConfig {
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

export interface PageMeta {
  layout?: string // name of layout in app/layouts/ (default: 'default')
  middleware?: string[] // named middleware files from app/middleware/
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
}

export interface PageLoaderContext<P extends Record<string, string> = Record<string, string>> {
  params: P
  query: Record<string, string>
  req: IncomingMessage
}

export type PageLoader<
  P extends Record<string, string> = Record<string, string>,
  D = Record<string, unknown>,
> = (ctx: PageLoaderContext<P>) => Promise<D> | D
