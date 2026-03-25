/**
 * OAUTH_PROVIDERS constant tests.
 *
 * Verifies that all built-in providers expose the required endpoint fields
 * and that the pkce flag is set correctly.
 */

import { describe, it, expect } from 'vitest'
import { OAUTH_PROVIDERS } from '../../../runtime/oauth/providers.js'

describe('OAUTH_PROVIDERS', () => {
  const REQUIRED_FIELDS = ['authorizationUrl', 'tokenUrl', 'userInfoUrl', 'defaultScopes', 'pkce']

  for (const provider of ['google', 'github', 'discord']) {
    describe(provider, () => {
      it('has all required fields', () => {
        const p = OAUTH_PROVIDERS[provider]
        for (const field of REQUIRED_FIELDS) {
          expect(p).toHaveProperty(field)
        }
      })

      it('authorizationUrl is a valid HTTPS URL', () => {
        expect(OAUTH_PROVIDERS[provider].authorizationUrl).toMatch(/^https:\/\//)
      })

      it('tokenUrl is a valid HTTPS URL', () => {
        expect(OAUTH_PROVIDERS[provider].tokenUrl).toMatch(/^https:\/\//)
      })

      it('userInfoUrl is a valid HTTPS URL', () => {
        expect(OAUTH_PROVIDERS[provider].userInfoUrl).toMatch(/^https:\/\//)
      })

      it('defaultScopes is a non-empty array', () => {
        expect(Array.isArray(OAUTH_PROVIDERS[provider].defaultScopes)).toBe(true)
        expect(OAUTH_PROVIDERS[provider].defaultScopes.length).toBeGreaterThan(0)
      })
    })
  }

  it('github pkce is false (GitHub does not support PKCE)', () => {
    expect(OAUTH_PROVIDERS.google.pkce).toBe(true)
    expect(OAUTH_PROVIDERS.github.pkce).toBe(false)
    expect(OAUTH_PROVIDERS.discord.pkce).toBe(true)
  })
})
