import { describe, it, expect, afterEach } from 'vitest'
import { beginHeadCollection, endHeadCollection } from '../../runtime/composables/use-head.js'
import { useSeoMeta } from '../../runtime/composables/use-seo-meta.js'

// All tests run in SSR collection mode so we can inspect the output without a DOM.

describe('useSeoMeta — SSR collection', () => {
  afterEach(() => {
    endHeadCollection()
  })

  it('sets the document title', () => {
    beginHeadCollection()
    useSeoMeta({ title: 'My Page' })
    const [head] = endHeadCollection()
    expect(head.title).toBe('My Page')
  })

  it('emits a description meta tag', () => {
    beginHeadCollection()
    useSeoMeta({ description: 'A great page.' })
    const [head] = endHeadCollection()
    expect(head.meta).toContainEqual({ name: 'description', content: 'A great page.' })
  })

  it('emits Open Graph meta tags', () => {
    beginHeadCollection()
    useSeoMeta({
      ogTitle: 'OG Title',
      ogDescription: 'OG Desc',
      ogImage: 'https://example.com/og.png',
      ogUrl: 'https://example.com/',
      ogType: 'website',
      ogSiteName: 'Example',
    })
    const [head] = endHeadCollection()
    expect(head.meta).toContainEqual({ property: 'og:title', content: 'OG Title' })
    expect(head.meta).toContainEqual({ property: 'og:description', content: 'OG Desc' })
    expect(head.meta).toContainEqual({ property: 'og:image', content: 'https://example.com/og.png' })
    expect(head.meta).toContainEqual({ property: 'og:url', content: 'https://example.com/' })
    expect(head.meta).toContainEqual({ property: 'og:type', content: 'website' })
    expect(head.meta).toContainEqual({ property: 'og:site_name', content: 'Example' })
  })

  it('emits Twitter Card meta tags', () => {
    beginHeadCollection()
    useSeoMeta({
      twitterCard: 'summary_large_image',
      twitterTitle: 'Tweet Title',
      twitterDescription: 'Tweet Desc',
      twitterImage: 'https://example.com/tw.png',
      twitterSite: '@mysite',
    })
    const [head] = endHeadCollection()
    expect(head.meta).toContainEqual({ name: 'twitter:card', content: 'summary_large_image' })
    expect(head.meta).toContainEqual({ name: 'twitter:title', content: 'Tweet Title' })
    expect(head.meta).toContainEqual({ name: 'twitter:description', content: 'Tweet Desc' })
    expect(head.meta).toContainEqual({ name: 'twitter:image', content: 'https://example.com/tw.png' })
    expect(head.meta).toContainEqual({ name: 'twitter:site', content: '@mysite' })
  })

  it('emits a canonical link element', () => {
    beginHeadCollection()
    useSeoMeta({ canonical: 'https://example.com/my-page' })
    const [head] = endHeadCollection()
    expect(head.link).toContainEqual({ rel: 'canonical', href: 'https://example.com/my-page' })
  })

  it('omits meta/link arrays when no tags are provided', () => {
    beginHeadCollection()
    useSeoMeta({ title: 'Only Title' })
    const [head] = endHeadCollection()
    expect(head.meta).toBeUndefined()
    expect(head.link).toBeUndefined()
  })

  it('only emits tags for fields that are explicitly set', () => {
    beginHeadCollection()
    useSeoMeta({ ogTitle: 'Just OG' })
    const [head] = endHeadCollection()
    // description was not provided — must not appear
    expect(head.meta?.some((m) => m.name === 'description')).toBeFalsy()
    expect(head.meta).toContainEqual({ property: 'og:title', content: 'Just OG' })
  })

  it('allows all fields to be set together', () => {
    beginHeadCollection()
    useSeoMeta({
      title: 'Full Page',
      description: 'Full description.',
      ogTitle: 'Full OG Title',
      ogDescription: 'Full OG Desc',
      ogImage: 'https://example.com/og.png',
      ogUrl: 'https://example.com/',
      ogType: 'article',
      ogSiteName: 'My Site',
      twitterCard: 'summary',
      twitterTitle: 'Full Twitter Title',
      twitterDescription: 'Full Twitter Desc',
      twitterImage: 'https://example.com/tw.png',
      twitterSite: '@site',
      canonical: 'https://example.com/full',
    })
    const [head] = endHeadCollection()
    expect(head.title).toBe('Full Page')
    expect(head.meta).toHaveLength(12) // description + 6 OG + 5 Twitter
    expect(head.link).toHaveLength(1)
  })
})
