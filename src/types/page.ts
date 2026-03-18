import type { IncomingMessage } from 'node:http'

export type HydrateStrategy = 'load' | 'idle' | 'visible' | 'none'

export interface SsgPathsContext {
  params: Record<string, string>
}

export interface PageSsgConfig {
  paths?: () => Promise<SsgPathsContext[]> | SsgPathsContext[]
}

export interface PageMeta {
  layout?: string // name of layout in app/layouts/ (default: 'default')
  middleware?: string[] // named middleware files from app/middleware/
  hydrate?: HydrateStrategy
  ssg?: PageSsgConfig
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
