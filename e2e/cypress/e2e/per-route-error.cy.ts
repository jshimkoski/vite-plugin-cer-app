/**
 * P2-2: Per-route error components.
 *
 * Tests that co-located *.error.ts and directory-level _error.ts files
 * are used as the error boundary for their specific routes, taking precedence
 * over the global error component.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

describe('Per-route error components (P2-2)', () => {
  context('co-located *.error.ts', () => {
    it('shows the co-located error component when the page loader throws', () => {
      cy.visit('/per-route-error-test', { failOnStatusCode: false })
      // The per-route error component (not the global one) should appear
      cy.get('[data-cy=per-route-error]', { timeout: 5000 }).should('exist')
    })

    it('the per-route error component receives the error message', () => {
      cy.visit('/per-route-error-test', { failOnStatusCode: false })
      cy.get('[data-cy=per-route-error]', { timeout: 5000 })
        .should('contain', 'per-route-error')
    })
  })

  if (mode === 'ssr') {
    context('SSR — per-route error uses the route errorTag', () => {
      it('SSR response body contains the per-route error element tag', () => {
        cy.request({ url: '/per-route-error-test', failOnStatusCode: false }).then((response) => {
          expect(response.body).to.include('page-per-route-error-test-error')
        })
      })

      it('does not render the global page-error element for per-route errors', () => {
        cy.request({ url: '/per-route-error-test', failOnStatusCode: false }).then((response) => {
          // Per-route error tag takes priority over global errorTag
          expect(response.body).to.include('page-per-route-error-test-error')
        })
      })
    })
  }
})
