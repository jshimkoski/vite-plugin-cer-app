/**
 * E2E tests for client-side route middleware (navigation guards).
 *
 * The kitchen-sink app ships an `auth` middleware that redirects unauthenticated
 * users to /login. The /protected page declares `meta: { middleware: ['auth'] }`.
 */

describe('Route middleware', () => {
  beforeEach(() => {
    // Ensure no stale auth token from a previous test
    cy.clearLocalStorage()
  })

  context('unauthenticated navigation', () => {
    it('redirects to /login when visiting /protected without a token', () => {
      cy.visit('/protected')
      cy.url().should('include', '/login')
    })

    it('shows the login page after redirect', () => {
      cy.visit('/protected')
      cy.get('[data-cy=login-heading]').should('contain', 'Login')
    })
  })

  context('authenticated navigation', () => {
    beforeEach(() => {
      cy.visit('/')
      cy.window().then((win) => {
        win.localStorage.setItem('ks-token', '1')
      })
    })

    it('allows navigation to /protected when a token is present', () => {
      cy.visit('/protected')
      cy.url().should('include', '/protected')
      cy.get('[data-cy=protected-heading]').should('contain', 'Protected')
    })

    it('renders the protected page content', () => {
      cy.visit('/protected')
      cy.get('[data-cy=protected-note]').should('exist')
    })
  })
})
