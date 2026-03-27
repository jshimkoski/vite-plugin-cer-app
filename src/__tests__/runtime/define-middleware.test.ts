import { describe, it, expect } from 'vitest'
import { defineMiddleware } from '../../runtime/composables/define-middleware.js'
import type { MiddlewareFn } from '../../types/middleware.js'

describe('defineMiddleware', () => {
  it('returns the function passed to it unchanged', () => {
    const fn: MiddlewareFn = async () => true
    expect(defineMiddleware(fn)).toBe(fn)
  })

  it('the returned function returns true to allow navigation', async () => {
    const mw = defineMiddleware(async () => true)
    const result = await mw({} as never, null)
    expect(result).toBe(true)
  })

  it('the returned function returns false to block navigation', async () => {
    const mw = defineMiddleware(async () => false)
    const result = await mw({} as never, null)
    expect(result).toBe(false)
  })

  it('the returned function returns a string to redirect', async () => {
    const mw = defineMiddleware(async () => '/login')
    const result = await mw({} as never, null)
    expect(result).toBe('/login')
  })

  it('the returned function receives to and from route states', async () => {
    let capturedTo: unknown
    let capturedFrom: unknown
    const mw = defineMiddleware((to, from) => {
      capturedTo = to
      capturedFrom = from
      return true
    })
    const to = { path: '/dashboard', params: {}, query: {} }
    const from = { path: '/login', params: {}, query: {} }
    await mw(to as never, from as never, async () => {})
    expect(capturedTo).toBe(to)
    expect(capturedFrom).toBe(from)
  })

  it('the returned function receives a next() callback as the third argument', async () => {
    let nextCalled = false
    const mw = defineMiddleware(async (_to, _from, next) => {
      await next()
      nextCalled = true
    })
    await mw({} as never, null, async () => { nextCalled = false /* reset before wrapper code runs */ })
    expect(nextCalled).toBe(true)
  })

  it('wrapper middleware can run code before and after next()', async () => {
    const order: string[] = []
    const mw = defineMiddleware(async (_to, _from, next) => {
      order.push('before')
      await next()
      order.push('after')
    })
    await mw({} as never, null, async () => { order.push('next') })
    expect(order).toEqual(['before', 'next', 'after'])
  })
})
