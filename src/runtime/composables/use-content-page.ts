import type { ContentHeading, ContentItem, ContentMeta } from '../../types/content.js'
import type { PageLoaderContext } from '../../types/page.js'
import { queryContent } from './use-content.js'
import { useHead } from './use-head.js'
import { useSeoMeta } from './use-seo-meta.js'

export interface ContentPageData {
  doc: ContentItem | null
  existingPaths: string[]
}

export interface ContentBreadcrumb {
  label: string
  path: string
  icon: string
  key: string
  isLast: boolean
  hasPage: boolean
}

export interface ContentBreadcrumbOptions {
  rootLabel?: string
  rootIcon?: string
  formatLabel?: (segment: string) => string
}

export interface ContentPageLoaderOptions {
  /** Catch-all route parameter name. Defaults to `all`. */
  param?: string
}

export interface ContentSeoOptions {
  doc: ContentItem | null
  path: string
  siteUrl: string
  siteName?: string
  image?: string
  breadcrumbs?: ContentBreadcrumb[]
  /** Path depth at which Open Graph pages become articles. Defaults to 2. */
  articleDepth?: number
  notFoundTitle?: string
}

/** Normalize a route/catch-all value into the content layer's absolute path form. */
export function normalizeContentPath(value: string | undefined | null): string {
  const slug = String(value ?? '').replace(/^\/+|\/+$/g, '')
  return slug ? `/${slug}` : '/'
}

function ancestorPaths(path: string): string[] {
  const segments = path.split('/').filter(Boolean)
  const paths = ['/']
  let current = ''
  for (let index = 0; index < segments.length - 1; index += 1) {
    current += `/${segments[index]}`
    paths.push(current)
  }
  return paths
}

/** Create a catch-all content loader with document and ancestor-page data. */
export function defineContentPageLoader(options: ContentPageLoaderOptions = {}) {
  const param = options.param ?? 'all'
  return async ({ params }: PageLoaderContext): Promise<ContentPageData> => {
    const path = normalizeContentPath(params[param])
    const doc = await queryContent(path).first()
    const ancestors = ancestorPaths(path)
    const found = await queryContent()
      .where((item) => ancestors.includes(item._path))
      .find()
    const foundPaths = new Set(found.map((item: ContentMeta) => item._path))
    return {
      doc,
      existingPaths: ancestors.filter((ancestor) => foundPaths.has(ancestor)),
    }
  }
}

function defaultFormatLabel(segment: string): string {
  let decoded = segment
  try { decoded = decodeURIComponent(segment) } catch { /* retain the safe original */ }
  return decoded
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** Build accessible breadcrumb data from a content path and known ancestor pages. */
export function useContentBreadcrumbs(
  path: string,
  doc: ContentItem | null,
  existingPaths: readonly string[] = ['/'],
  options: ContentBreadcrumbOptions = {},
): ContentBreadcrumb[] {
  const normalized = normalizeContentPath(path)
  const segments = normalized.split('/').filter(Boolean)
  const formatLabel = options.formatLabel ?? defaultFormatLabel
  const pagePaths = new Set(existingPaths)
  const crumbs: Array<{ label: string; path: string; icon: string }> = [{
    label: options.rootLabel ?? 'Home',
    path: '/',
    icon: options.rootIcon ?? 'home',
  }]
  let current = ''

  segments.forEach((segment, index) => {
    current += `/${segment}`
    crumbs.push({
      label: index === segments.length - 1 && doc?.title
        ? doc.title
        : formatLabel(segment),
      path: current,
      icon: '',
    })
  })

  return crumbs.map((crumb, index) => ({
    ...crumb,
    key: crumb.path,
    isLast: index === crumbs.length - 1,
    hasPage: crumb.path === '/' || pagePaths.has(crumb.path) || index === crumbs.length - 1,
  }))
}

/** Return the document headings appropriate for a table of contents. */
export function useContentHeadings(
  doc: Pick<ContentItem, 'toc'> | null | undefined,
  depths: readonly ContentHeading['depth'][] = [2, 3],
): ContentHeading[] {
  const included = new Set(depths)
  return (doc?.toc ?? []).filter((heading) => included.has(heading.depth))
}

function absoluteUrl(origin: string, value: string): string {
  try { return new URL(value, `${origin}/`).href } catch { return value }
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function hasMatchingIndexableDocument(canonical: string): boolean {
  if (typeof document === 'undefined') return false
  const existingCanonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
  const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content ?? ''
  if (!existingCanonical || /\bnoindex\b/i.test(robots) || !/\bindex\b/i.test(robots)) return false
  try {
    const existing = new URL(existingCanonical)
    const requested = new URL(canonical)
    const normalizePath = (value: string) => value.replace(/\/+$/, '') || '/'
    const matchesLocation = typeof location !== 'undefined'
      && normalizePath(existing.pathname) === normalizePath(location.pathname)
    return matchesLocation || existing.href === requested.href
  } catch {
    return existingCanonical === canonical
  }
}

/** Apply consistent content title, canonical, social, robots, and JSON-LD metadata. */
export function useContentSeo(options: ContentSeoOptions): void {
  const origin = options.siteUrl.replace(/\/$/, '')
  const path = normalizeContentPath(options.path)
  const canonical = `${origin}${path === '/' ? '' : path}`

  // A `hydrate: 'none'` content page intentionally omits loader payload from
  // the client. Defining its custom element still runs setup once against the
  // already-rendered DSD, so `doc` is temporarily null even though the server
  // emitted a complete, indexable document. Preserve that matching server head;
  // a real not-found navigation has a different canonical and falls through.
  if (!options.doc && hasMatchingIndexableDocument(canonical)) return

  const title = options.doc?.title ?? options.notFoundTitle ?? 'Not found'
  const fullTitle = options.siteName ? `${title} - ${options.siteName}` : title
  const image = options.image ? absoluteUrl(origin, options.image) : undefined
  const depth = path.split('/').filter(Boolean).length

  useSeoMeta({
    title: fullTitle,
    description: options.doc?.description,
    canonical,
    ogTitle: fullTitle,
    ogDescription: options.doc?.description,
    ogImage: image,
    ogUrl: canonical,
    ogType: options.doc && depth >= (options.articleDepth ?? 2) ? 'article' : 'website',
    ogSiteName: options.siteName,
    twitterCard: image ? 'summary_large_image' : 'summary',
    twitterTitle: fullTitle,
    twitterDescription: options.doc?.description,
    twitterImage: image,
  })

  // Always publish the current route's indexing decision. A catch-all
  // component can render once with incomplete loader/prop data before its
  // final document render, and client navigation can recover from a 404. An
  // explicit indexable value lets the head deduper and live DOM update replace
  // a stale noindex rather than leaving a valid page blocked from crawlers.
  useHead({
    meta: [{ name: 'robots', content: options.doc ? 'index, follow' : 'noindex' }],
  })
  if (!options.doc) return

  const breadcrumbItems = (options.breadcrumbs ?? []).map((crumb, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: crumb.label,
    item: `${origin}${crumb.path === '/' ? '' : crumb.path}`,
  }))
  useHead({
    script: [{
      type: 'application/ld+json',
      innerHTML: safeJson({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': canonical,
        url: canonical,
        name: fullTitle,
        description: options.doc.description,
        ...(breadcrumbItems.length > 0 ? {
          breadcrumb: {
            '@type': 'BreadcrumbList',
            itemListElement: breadcrumbItems,
          },
        } : {}),
      }),
    }],
  })
}
