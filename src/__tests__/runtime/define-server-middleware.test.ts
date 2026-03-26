import { describe, it, expect } from 'vitest'
import { defineServerMiddleware } from '../../runtime/composables/define-server-middleware.js'
import type { ServerMiddleware } from '../../types/middleware.js'

describe('defineServerMiddleware', () => {
  it('returns the function passed to it unchanged', () => {
    const fn: ServerMiddleware = async (_req, _res, next) => next()
    expect(defineServerMiddleware(fn)).toBe(fn)
  })

  it('the returned function calls next() to continue the chain', async () => {
    let nextCalled = false
    const mw = defineServerMiddleware(async (_req, _res, next) => {
      nextCalled = true
      next()
    })
    await mw({} as never, {} as never, () => {})
    expect(nextCalled).toBe(true)
  })

  it('the returned function can end the request without calling next()', async () => {
    let nextCalled = false
    const mw = defineServerMiddleware(async (_req, res: { end: (b: string) => void }, _next) => {
      res.end('Unauthorized')
    })
    await mw({} as never, { end: () => { nextCalled = false } } as never, () => { nextCalled = true })
    expect(nextCalled).toBe(false)
  })

  it('receives req, res, and next as arguments', async () => {
    let capturedReq: unknown
    let capturedRes: unknown
    let capturedNext: unknown
    const mw = defineServerMiddleware((req, res, next) => {
      capturedReq = req
      capturedRes = res
      capturedNext = next
      next()
    })
    const fakeReq = { url: '/test' }
    const fakeRes = { statusCode: 200 }
    const fakeNext = () => {}
    await mw(fakeReq as never, fakeRes as never, fakeNext)
    expect(capturedReq).toBe(fakeReq)
    expect(capturedRes).toBe(fakeRes)
    expect(capturedNext).toBe(fakeNext)
  })

  it('is generic — a typed ServerMiddleware satisfies the return type', () => {
    const fn: ServerMiddleware = (_req, _res, next) => next()
    const result = defineServerMiddleware(fn)
    expect(typeof result).toBe('function')
  })
})
