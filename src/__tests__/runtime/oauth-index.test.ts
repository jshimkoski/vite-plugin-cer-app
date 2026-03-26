import { describe, it, expect } from 'vitest'
import { defineOAuthProvider } from '../../runtime/oauth/index.js'

describe('defineOAuthProvider', () => {
  it('returns the config object unchanged', () => {
    const cfg = { clientId: 'id', clientSecret: 'secret' }
    expect(defineOAuthProvider(cfg)).toBe(cfg)
  })

  it('preserves clientId and clientSecret', () => {
    const result = defineOAuthProvider({ clientId: 'my-id', clientSecret: 'my-secret' })
    expect(result.clientId).toBe('my-id')
    expect(result.clientSecret).toBe('my-secret')
  })

  it('preserves optional scope array', () => {
    const result = defineOAuthProvider({
      clientId: 'id',
      clientSecret: 'secret',
      scope: ['read:user', 'user:email'],
    })
    expect(result.scope).toEqual(['read:user', 'user:email'])
  })

  it('preserves optional endpoint URLs', () => {
    const result = defineOAuthProvider({
      clientId: 'id',
      clientSecret: 'secret',
      authorizationUrl: 'https://auth.example.com/authorize',
      tokenUrl: 'https://auth.example.com/token',
      userInfoUrl: 'https://auth.example.com/userinfo',
    })
    expect(result.authorizationUrl).toBe('https://auth.example.com/authorize')
    expect(result.tokenUrl).toBe('https://auth.example.com/token')
    expect(result.userInfoUrl).toBe('https://auth.example.com/userinfo')
  })

  it('works as a pass-through for TypeScript inference (returns same reference)', () => {
    const input = { clientId: 'cid', clientSecret: 'csecret', scope: ['openid'] }
    const output = defineOAuthProvider(input)
    expect(output).toBe(input)
  })
})
