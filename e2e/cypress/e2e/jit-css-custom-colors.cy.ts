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
  beforeEach(() => {
    cy.visit('/jit-css-custom-colors-test')
    cy.get('cer-layout-view').shadow().find('page-jit-css-custom-colors-test').should('exist')
  })

  it('applies custom color as background-color', () => {
    cy.get('cer-layout-view')
      .shadow()
      .find('page-jit-css-custom-colors-test')
      .shadow()
      .find('[data-cy="brand-bg"]')
      .should('have.css', 'background-color', 'rgb(124, 58, 237)')
  })

  it('applies custom color as text color', () => {
    cy.get('cer-layout-view')
      .shadow()
      .find('page-jit-css-custom-colors-test')
      .shadow()
      .find('[data-cy="brand-text"]')
      .should('have.css', 'color', 'rgb(124, 58, 237)')
  })

  it('applies a different shade of the custom color', () => {
    cy.get('cer-layout-view')
      .shadow()
      .find('page-jit-css-custom-colors-test')
      .shadow()
      .find('[data-cy="brand-light-bg"]')
      .should('have.css', 'background-color', 'rgb(237, 233, 254)')
  })
})
