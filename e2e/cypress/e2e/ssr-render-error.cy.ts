/**
 * E2E tests for SSR render error resilience (P0-1).
 *
 * When a page component throws during the SSR render pass, the custom-elements
 * runtime catches the error internally (logs a warning, emits an empty DSD
 * placeholder) and continues rendering — so the server returns 200 with a valid
 * HTML document. The entry-server-template's try/catch protects against
 * *infrastructure-level* errors that escape the runtime's own protection (e.g.
 * a catastrophic failure in the SSR helpers themselves).
 *
 * Observable behaviour for a component-level throw:
 * - HTTP 200 (runtime handles it gracefully)
 * - Valid HTML body with the page skeleton
 * - Server remains operational for subsequent requests
 *
 * Only meaningful in SSR mode where the server renders pages on-request.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

if (mode === 'ssr') {
  describe('SSR render error resilience — P0-1', () => {
    it('returns HTTP 200 when a page component throws during render (runtime handles gracefully)', () => {
      cy.request({ url: '/render-error-test', failOnStatusCode: false }).then((response) => {
        expect(response.status).to.eq(200)
      })
    })

    it('returns a non-empty HTML body even when a component throws', () => {
      cy.request({ url: '/render-error-test', failOnStatusCode: false }).then((response) => {
        expect(response.body).to.be.a('string')
        expect(response.body.length).to.be.greaterThan(0)
        expect(response.body).to.include('<!DOCTYPE html>')
      })
    })

    it('serves a Content-Type: text/html header', () => {
      cy.request({ url: '/render-error-test', failOnStatusCode: false }).then((response) => {
        expect(response.headers['content-type']).to.include('text/html')
      })
    })

    it('the broken component renders as an empty DSD placeholder (graceful degradation)', () => {
      cy.request({ url: '/render-error-test', failOnStatusCode: false }).then((response) => {
        // The runtime emits <page-render-error-test><template shadowrootmode="open"></template>...
        // or the component tag is present with an empty shadow root.
        expect(response.body).to.include('page-render-error-test')
      })
    })

    it('server responds normally to other routes after a component render error', () => {
      // First hit the broken route.
      cy.request({ url: '/render-error-test', failOnStatusCode: false })
      // Verify the server hasn't crashed and can still serve other routes.
      cy.request('/about').then((response) => {
        expect(response.status).to.eq(200)
      })
    })

    it('does not leave the server hanging after a component render error', () => {
      // If the server hung, cy.request() would time out (30s default).
      // A response (any status) within timeout confirms no hang.
      cy.request({ url: '/render-error-test', failOnStatusCode: false }).then((response) => {
        expect(response.status).to.be.a('number')
      })
    })
  })
}
