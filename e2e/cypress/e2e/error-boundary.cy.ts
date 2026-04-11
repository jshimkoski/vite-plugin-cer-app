/**
 * Tests for the error boundary.
 *
 * SSR: when a page loader throws, the server renders `page-error` (from app/error.ts)
 * instead of crashing, and returns the correct HTTP status code.
 *
 * Client-side: when navigating to a page whose loader throws, currentError is set
 * and the error boundary component is displayed.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

// Client-side loader error boundary — works in all modes via client-side navigation
describe('Client-side error boundary — loader throws during navigation', () => {
  it('shows the error boundary after navigating to a page whose loader throws', () => {
    cy.visit('/')
    // Navigate via the router so the client-side loader runs (not a hard page load)
    cy.window().then((win) => {
      // @ts-expect-error cerRouter is a private global
      win.__cerRouter?.push('/loader-error-test')
    })
    cy.get('[data-cy=error-boundary]', { timeout: 5000 }).should('exist')
  })

  it('error message contains the loader error text after client-side navigation', () => {
    cy.visit('/')
    cy.window().then((win) => {
      // @ts-expect-error cerRouter is a private global
      win.__cerRouter?.push('/loader-error-test')
    })
    cy.get('[data-cy=error-message]', { timeout: 5000 }).should('contain', 'Loader intentionally failed')
  })
})

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

  describe('SSR error boundary — loader throws a Response object', () => {
    it('reads the numeric .status from the thrown Response (405)', () => {
      cy.request({ url: '/loader-response-error-test', failOnStatusCode: false }).then((response) => {
        expect(response.status).to.eq(405)
      })
    })

    it('renders page-error element in the server response for a thrown Response', () => {
      cy.request({ url: '/loader-response-error-test', failOnStatusCode: false }).then((response) => {
        expect(response.body).to.include('page-error')
      })
    })

    it('does not render the normal page heading when a Response is thrown', () => {
      cy.request({ url: '/loader-response-error-test', failOnStatusCode: false }).then((response) => {
        expect(response.body).not.to.include('loader-response-error-heading')
      })
    })
  })
}
