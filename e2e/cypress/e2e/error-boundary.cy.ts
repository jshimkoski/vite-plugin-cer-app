/**
 * Tests for the SSR error boundary.
 *
 * When a page loader throws, the server renders `page-error` (from app/error.ts)
 * instead of crashing, and returns the correct HTTP status code.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

// SSR loader error boundary — only meaningful when a server render happens
if (mode === 'ssr') {
  describe('SSR error boundary — loader throws', () => {
    it('returns the status code from the thrown error (503)', () => {
      cy.request({ url: '/loader-error-test', failOnStatusCode: false }).then((response) => {
        expect(response.status).to.eq(503)
      })
    })

    it('renders page-error element in the server response', () => {
      cy.request({ url: '/loader-error-test', failOnStatusCode: false }).then((response) => {
        expect(response.body).to.include('page-error')
      })
    })

    it('does not render the normal page heading when loader throws', () => {
      cy.request({ url: '/loader-error-test', failOnStatusCode: false }).then((response) => {
        expect(response.body).not.to.include('loader-error-heading')
      })
    })

    it('shows the error boundary UI in the browser', () => {
      cy.visit('/loader-error-test', { failOnStatusCode: false })
      cy.get('[data-cy=error-boundary]').should('exist')
      cy.get('[data-cy=error-heading]').should('contain', '503')
      cy.get('[data-cy=error-message]').should('contain', 'Loader intentionally failed')
    })

    it('exposes a retry button that calls resetError()', () => {
      cy.visit('/loader-error-test', { failOnStatusCode: false })
      cy.get('[data-cy=error-retry]').should('exist')
    })
  })
}
