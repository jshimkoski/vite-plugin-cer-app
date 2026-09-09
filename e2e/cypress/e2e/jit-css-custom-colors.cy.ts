/**
 * Verifies that jitCss.customColors defined in cer.config.ts are available
 * as JIT CSS utility classes inside shadow DOM components.
 *
 * The kitchen-sink config registers:
 *   brand: { '500': '#7c3aed', '100': '#ede9fe', '900': '#4c1d95' }
 *
 * Tests run in every build mode (SPA, SSR, SSG).
 */

describe('jitCss.customColors', () => {
  const page = () =>
    cy
      .get('page-jit-css-custom-colors-test')
      .should(($host) => {
        expect($host).to.have.attr('data-cer-hydrated')
      })
      .shadow()

  beforeEach(() => {
    cy.visit('/jit-css-custom-colors-test')
    page().find('[data-cy="heading"]').should('exist')
  })

  it('applies custom color as background-color', () => {
    page()
      .find('[data-cy="brand-bg"]')
      .should('have.css', 'background-color', 'rgb(124, 58, 237)')
  })

  it('applies custom color as text color', () => {
    page()
      .find('[data-cy="brand-text"]')
      .should('have.css', 'color', 'rgb(124, 58, 237)')
  })

  it('applies a different shade of the custom color', () => {
    page()
      .find('[data-cy="brand-light-bg"]')
      .should('have.css', 'background-color', 'rgb(237, 233, 254)')
  })

  it('applies custom colors when the page is created by client-side navigation', () => {
    cy.visit('/')
    cy.window().then((win) => (win as any).__cerRouter.push('/jit-css-custom-colors-test'))
    page()
      .find('[data-cy="brand-bg"]')
      .should('have.css', 'background-color', 'rgb(124, 58, 237)')
  })
})
