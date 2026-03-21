import { useHead } from './use-head.js'

export interface SeoMetaInput {
  /** Sets the document title. */
  title?: string
  /** Sets the meta description. */
  description?: string
  // Open Graph
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
  ogUrl?: string
  /** e.g. `'website'`, `'article'`. No tag is emitted when omitted. */
  ogType?: string
  ogSiteName?: string
  // Twitter / X
  /** e.g. `'summary'`, `'summary_large_image'`. No tag is emitted when omitted. */
  twitterCard?: string
  twitterTitle?: string
  twitterDescription?: string
  twitterImage?: string
  /** Twitter/X site handle, e.g. '@mysite'. */
  twitterSite?: string
  /** Canonical URL injected as <link rel="canonical">. */
  canonical?: string
}

/**
 * Thin wrapper over `useHead()` for common SEO tags.
 *
 * Sets the page title, meta description, Open Graph tags, Twitter Card tags,
 * and a canonical link element. Only tags with a non-undefined value are emitted.
 *
 * It is auto-imported, so you don't need to import it manually.
 *
 * @example
 * ```ts
 * useSeoMeta({
 *   title: 'My page',
 *   description: 'A great page.',
 *   ogImage: 'https://example.com/og.png',
 *   canonical: 'https://example.com/my-page',
 * })
 * ```
 */
export function useSeoMeta(input: SeoMetaInput): void {
  const meta: Array<Record<string, string>> = []
  const link: Array<Record<string, string>> = []

  if (input.description !== undefined) meta.push({ name: 'description', content: input.description })

  // Open Graph
  if (input.ogTitle !== undefined) meta.push({ property: 'og:title', content: input.ogTitle })
  if (input.ogDescription !== undefined) meta.push({ property: 'og:description', content: input.ogDescription })
  if (input.ogImage !== undefined) meta.push({ property: 'og:image', content: input.ogImage })
  if (input.ogUrl !== undefined) meta.push({ property: 'og:url', content: input.ogUrl })
  if (input.ogType !== undefined) meta.push({ property: 'og:type', content: input.ogType })
  if (input.ogSiteName !== undefined) meta.push({ property: 'og:site_name', content: input.ogSiteName })

  // Twitter / X
  if (input.twitterCard !== undefined) meta.push({ name: 'twitter:card', content: input.twitterCard })
  if (input.twitterTitle !== undefined) meta.push({ name: 'twitter:title', content: input.twitterTitle })
  if (input.twitterDescription !== undefined) meta.push({ name: 'twitter:description', content: input.twitterDescription })
  if (input.twitterImage !== undefined) meta.push({ name: 'twitter:image', content: input.twitterImage })
  if (input.twitterSite !== undefined) meta.push({ name: 'twitter:site', content: input.twitterSite })

  // Canonical link
  if (input.canonical !== undefined) link.push({ rel: 'canonical', href: input.canonical })

  useHead({
    title: input.title,
    meta: meta.length > 0 ? meta : undefined,
    link: link.length > 0 ? link : undefined,
  })
}
