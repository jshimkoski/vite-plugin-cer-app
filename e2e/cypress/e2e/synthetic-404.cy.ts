/**
 * P1-1: Synthetic 404 catch-all fallback.
 *
 * When no user-defined catch-all page exists the framework injects a synthetic
 * /:all* route that returns `default: null`. The server must return HTTP 404
 * (not 500) and render the global error component if defined.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

describe('Synthetic 404 fallback (P1-1)', () => {
  context('visiting a completely unknown route', () => {
    it('navigating client-side to an unknown route does not crash the app', () => {
      cy.visit('/')
      cy.window().then((win) => {
        // @ts-expect-error cerRouter is a private global
        win.__cerRouter?.push('/this-route-does-not-exist-at-all')
      })
      // Page should still be functional — no JS error thrown
      cy.get('body').should('exist')
    })
  })

  if (mode === 'ssr') {
    context('SSR — unknown route returns 404', () => {
      it('returns HTTP 404 for an unknown path', () => {
        cy.request({
          url: '/completely-unknown-route-xyz',
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.eq(404)
        })
      })

      it('does not return 500 for an unknown path', () => {
        cy.request({
          url: '/another-unknown-path-abc',
          failOnStatusCode: false,
        }).then((response) => {
          expect(response.status).to.not.eq(500)
        })
      })
    })
  }
})
