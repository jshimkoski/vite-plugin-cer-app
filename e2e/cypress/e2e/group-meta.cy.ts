/**
 * P2-1: _layout.ts group meta inheritance.
 *
 * Verifies that middleware and layout declared in a directory's _layout.ts
 * are inherited by all pages in that directory, with page-level declarations
 * taking precedence.
 */

describe('Group meta from _layout.ts (P2-1)', () => {
  context('middleware inheritance', () => {
    it('applies group middleware from _layout.ts to pages in the directory', () => {
      // The group-meta-test/protected.ts page is in a directory with auth middleware
      // declared in _layout.ts — visiting without auth should trigger the middleware
      cy.visit('/group-meta-test/protected', { failOnStatusCode: false })
      // The auth middleware redirects or renders a guard indicator
      cy.get('[data-cy=group-auth-guard]', { timeout: 5000 }).should('exist')
    })

    it('page-level middleware overrides group middleware', () => {
      // The group-meta-test/custom-mw.ts overrides group middleware with its own
      cy.visit('/group-meta-test/custom-mw', { failOnStatusCode: false })
      cy.get('[data-cy=custom-mw-marker]', { timeout: 5000 }).should('exist')
    })
  })

  context('layout inheritance', () => {
    it('pages in a group directory use the layout declared in _layout.ts', () => {
      cy.visit('/group-meta-test/page')
      // The group layout wraps the page
      cy.get('[data-cy=group-layout]', { timeout: 5000 }).should('exist')
    })
  })
})
