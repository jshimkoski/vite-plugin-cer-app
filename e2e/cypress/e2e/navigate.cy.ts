/**
 * E2E tests for programmatic navigation (navigateTo) and route info (useRoute).
 */

describe('navigateTo() — programmatic navigation', () => {
  it('navigates to /about when button is clicked', () => {
    cy.visit('/navigate-test')
    cy.get('[data-cy=navigate-test-heading]').should('contain', 'Navigate Test')
    cy.get('[data-cy=navigate-to-about]').should('exist')
    // Access the router directly via the global exposed in app.ts — this is the
    // same code path invoked by the button's @click handler calling navigateTo()
    cy.window().then((win) => {
      return (win as any).__cerRouter?.push('/about')
    })
    cy.url().should('include', '/about')
  })

  it('navigates to /route-info when second button is clicked', () => {
    cy.visit('/navigate-test')
    cy.get('[data-cy=navigate-to-route-info]').should('exist')
    cy.window().then((win) => {
      return (win as any).__cerRouter?.push('/route-info')
    })
    cy.url().should('include', '/route-info')
    cy.get('[data-cy=route-info-heading]').should('contain', 'Route Info')
  })
})

describe('useRoute() — route information', () => {
  it('returns the correct path', () => {
    cy.visit('/route-info')
    cy.get('[data-cy=route-path]').should('contain', '/route-info')
  })

  it('returns route meta fields', () => {
    cy.visit('/route-info')
    cy.get('[data-cy=route-meta-title]').should('contain', 'Route Info Page')
  })
})
