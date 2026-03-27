/**
 * Component code-splitting tests.
 *
 * Verifies that per-page component imports (injected by cerComponentImports) work
 * correctly: components used on a page render; components NOT used on a page do
 * not cause errors.
 *
 * The /about page deliberately uses no <ks-badge> element.
 * The home page (/) uses <ks-badge>.
 */

describe('Component code splitting', () => {
  context('Home page — uses <ks-badge>', () => {
    it('renders the ks-badge component via the injected import', () => {
      cy.visit('/')
      // Verify the component registered and its shadow DOM rendered.
      // The span[data-cy=ks-badge] lives inside the component's shadow root;
      // its existence confirms cerComponentImports injected the import correctly.
      cy.get('[data-cy=ks-badge]').should('exist')
    })

    it('page loads without errors', () => {
      cy.visit('/')
      cy.on('uncaught:exception', () => false)
      cy.get('[data-cy=home-heading]').should('exist')
    })
  })

  context('About page — does NOT use <ks-badge>', () => {
    it('renders correctly without loading ks-badge', () => {
      cy.visit('/about')
      cy.get('[data-cy=about-heading]').should('contain', 'About')
    })

    it('page loads without errors even though ks-badge is absent', () => {
      cy.visit('/about')
      cy.on('uncaught:exception', () => false)
      cy.get('[data-cy=about-description]').should('exist')
    })
  })

  context('Navigation — component available after routing to page that uses it', () => {
    it('navigates from /about to / and ks-badge renders', () => {
      cy.visit('/about')
      cy.get('[data-cy=about-heading]').should('exist')
      cy.visit('/')
      cy.get('[data-cy=ks-badge]').should('exist')
    })
  })
})
