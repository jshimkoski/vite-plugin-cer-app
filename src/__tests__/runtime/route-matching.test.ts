import { describe, expect, it } from 'vitest'
import { matchRoutePattern, findRenderMode, findRevalidate } from '../../runtime/route-matching.js'
describe('shared route matching', () => {
  it('matches catch-all base paths and normalizes trailing slashes', () => {
    expect(matchRoutePattern('/guide/:rest*', '/guide')).toBe(true)
    expect(matchRoutePattern('/guide/:rest*', '/guide/chapter/')).toBe(true)
    expect(matchRoutePattern('/:all*', '/')).toBe(true)
    expect(matchRoutePattern('/item/:id', '/item/a/')).toBe(true)
    expect(matchRoutePattern('/item/:id', '/item/a/b')).toBe(false)
  })
  it('escapes literal pattern characters and respects ordered route overrides', () => {
    expect(matchRoutePattern('/file.v1', '/fileXv1')).toBe(false)
    const routes = [{ path: '/guide', meta: { render: 'server' } }, { path: '/:all*', meta: { render: 'static', ssg: { revalidate: 60 } } }]
    expect(findRenderMode(routes, '/guide')).toBe('server')
    expect(findRevalidate(routes, '/other')).toBe(60)
    expect(findRevalidate(routes, '/guide')).toBeNull()
  })
})
