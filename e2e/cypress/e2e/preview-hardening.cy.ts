/**
 * Preview server hardening e2e tests — verifies security headers,
 * Cache-Control values, and graceful shutdown behaviour.
 *
 * Security headers and Cache-Control are server-level concerns, so these
 * tests only run in SSR and SSG modes (both use `cer-app preview`).
 * SPA mode also runs through the preview server, so the tests apply there too.
 */

describe('Preview server — security headers', () => {
  it('responds with X-Content-Type-Options: nosniff', () => {
    cy.request('/').then((response) => {
      expect(response.headers['x-content-type-options']).to.eq('nosniff')
    })
  })

  it('responds with X-Frame-Options: DENY', () => {
    cy.request('/').then((response) => {
      expect(response.headers['x-frame-options']).to.eq('DENY')
    })
  })

  it('responds with Referrer-Policy: strict-origin-when-cross-origin', () => {
    cy.request('/').then((response) => {
      expect(response.headers['referrer-policy']).to.eq('strict-origin-when-cross-origin')
    })
  })

  it('includes security headers on 404 responses', () => {
    cy.request({ url: '/definitely-not-a-real-page-xyz', failOnStatusCode: false }).then((response) => {
      expect(response.headers['x-content-type-options']).to.eq('nosniff')
    })
  })
})

describe('Preview server — path traversal protection', () => {
  // HTTP clients (including Cypress/got) normalize `..` segments before sending,
  // so a raw traversal like `/../../../../etc/passwd` arrives at the server as
  // `/etc/passwd`. The `isPathBounded` guard is exercised via unit tests
  // (src/__tests__/cli/preview-isr.test.ts). Here we verify the observable
  // guarantee: files that do not exist inside dist/ are never served.
  it('does not serve a file that does not exist inside dist/', () => {
    cy.request({ url: '/etc/passwd', failOnStatusCode: false }).then((response) => {
      // Either 404 (static) or 200 (SSR SPA fallback) — never a served file from
      // outside the dist directory. Critically, the response body must NOT contain
      // typical /etc/passwd content.
      expect(response.body).not.to.include('root:x:')
      expect(response.body).not.to.include('/bin/bash')
    })
  })

  // NOTE: HTTP clients (including Cypress/got) normalize `..` segments before
  // sending, so raw traversal sequences never arrive at the server unchanged.
  // The isPathBounded() guard is exhaustively covered at the unit level in
  // src/__tests__/cli/preview-isr.test.ts. No additional e2e assertion is needed.
})

describe('Preview server — Cache-Control', () => {
  it('serves HTML with Cache-Control: no-cache', () => {
    cy.request('/').then((response) => {
      expect(response.headers['cache-control']).to.include('no-cache')
    })
  })

  it('serves content-hashed assets with immutable Cache-Control', () => {
    // Get the page to discover an actual asset URL (Vite hashes asset filenames)
    cy.request('/').then((htmlResponse) => {
      const assetMatch = htmlResponse.body.match(/\/assets\/[^"'\s]+\.js/)
      if (!assetMatch) return  // no JS asset found in this page, skip

      const assetUrl = assetMatch[0]
      cy.request(assetUrl).then((assetResponse) => {
        const cc = assetResponse.headers['cache-control'] as string
        expect(cc).to.include('max-age=31536000')
        expect(cc).to.include('immutable')
      })
    })
  })
})
