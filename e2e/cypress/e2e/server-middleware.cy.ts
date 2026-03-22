/**
 * Server middleware e2e tests — verifies that files in server/middleware/ run
 * on every HTTP request before API routes and SSR rendering.
 *
 * The kitchen-sink includes `server/middleware/01-headers.ts` which sets
 * `X-CER-Middleware: active` on every response. These tests confirm that
 * header is present, proving the middleware chain executed.
 *
 * Server middleware runs in SSR mode (production) and dev mode. It does NOT
 * run in SPA or SSG static-file serving modes, so tests are gated accordingly.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

// Server middleware only runs when there is a live server processing requests.
// In dev mode the Vite middleware chain applies it; in SSR preview it is called
// by runServerMiddleware(). SPA and SSG preview servers serve static files and
// do not execute server middleware.
if (mode === 'ssr') {
  describe('Server middleware — header injection (SSR)', () => {
    it('adds X-CER-Middleware header to HTML responses', () => {
      cy.request('/').then((response) => {
        expect(response.headers['x-cer-middleware']).to.eq('active')
      })
    })

    it('adds X-CER-Middleware header to API responses', () => {
      cy.request('/api/health').then((response) => {
        expect(response.headers['x-cer-middleware']).to.eq('active')
      })
    })

    it('adds X-CER-Middleware header to 404 responses', () => {
      cy.request({ url: '/this-path-does-not-exist', failOnStatusCode: false }).then((response) => {
        expect(response.headers['x-cer-middleware']).to.eq('active')
      })
    })

    it('middleware runs before API route handlers (header present on /api/posts)', () => {
      cy.request('/api/posts').then((response) => {
        expect(response.status).to.eq(200)
        expect(response.headers['x-cer-middleware']).to.eq('active')
      })
    })
  })
}
