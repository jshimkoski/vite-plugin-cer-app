import { describe, it, expect, beforeEach } from 'vitest'
import { usePageData } from '../../runtime/composables/use-page-data.js'

describe('usePageData', () => {
  beforeEach(() => {
    // Clean up global state between tests
    delete (globalThis as Record<string, unknown>)['__CER_DATA__']
  })

  it('returns null when no SSR data is present', () => {
    expect(usePageData()).toBeNull()
  })

  it('returns the data when __CER_DATA__ is set on globalThis', () => {
    const data = { id: '1', name: 'Laptop', price: 999 }
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = data
    expect(usePageData()).toEqual(data)
  })

  it('clears __CER_DATA__ after the first read', () => {
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { title: 'Hello' }
    usePageData()
    expect((globalThis as Record<string, unknown>)['__CER_DATA__']).toBeUndefined()
  })

  it('returns null on subsequent calls after the data has been consumed', () => {
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = { title: 'Hello' }
    usePageData()
    expect(usePageData()).toBeNull()
  })

  it('is generic and preserves the typed shape', () => {
    interface Post { slug: string; title: string }
    const post: Post = { slug: 'hello', title: 'Hello World' }
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = post
    const result = usePageData<Post>()
    expect(result?.slug).toBe('hello')
    expect(result?.title).toBe('Hello World')
  })

  it('returns null when __CER_DATA__ is explicitly null', () => {
    ;(globalThis as Record<string, unknown>)['__CER_DATA__'] = null
    expect(usePageData()).toBeNull()
  })
})
