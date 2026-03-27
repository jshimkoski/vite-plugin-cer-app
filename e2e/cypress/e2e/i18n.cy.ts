/**
 * E2E tests for i18n routing and useLocale() composable.
 *
 * The kitchen-sink is configured with:
 *   locales: ['en', 'fr'], defaultLocale: 'en', strategy: 'prefix_except_default'
 *
 * This means:
 *   /i18n-test      → renders in default locale (en)
 *   /fr/i18n-test   → renders in locale (fr)
 */

describe('i18n routing — useLocale()', () => {
  context('default locale (unprefixed path)', () => {
    it('renders the i18n-test page at /i18n-test', () => {
      cy.visit('/i18n-test')
      cy.get('[data-cy=i18n-heading]').should('contain', 'i18n Test Page')
    })

    it('reports "en" as the current locale on /i18n-test', () => {
      cy.visit('/i18n-test')
      cy.get('[data-cy=current-locale]').should('have.text', 'en')
    })

    it('reports "en" as the defaultLocale', () => {
      cy.visit('/i18n-test')
      cy.get('[data-cy=default-locale]').should('have.text', 'en')
    })

    it('reports all configured locales', () => {
      cy.visit('/i18n-test')
      cy.get('[data-cy=locales]').should('have.text', 'en,fr')
    })

    it('switchLocalePath("fr") produces /fr/i18n-test', () => {
      cy.visit('/i18n-test')
      cy.get('[data-cy=switch-to-fr]').should('have.attr', 'href', '/fr/i18n-test')
    })

    it('switchLocalePath("en") on the default locale keeps the unprefixed path', () => {
      cy.visit('/i18n-test')
      cy.get('[data-cy=switch-to-en]').should('have.attr', 'href', '/i18n-test')
    })
  })

  context('non-default locale (fr-prefixed path)', () => {
    it('renders the i18n-test page at /fr/i18n-test', () => {
      cy.visit('/fr/i18n-test')
      cy.get('[data-cy=i18n-heading]').should('contain', 'i18n Test Page')
    })

    it('reports "fr" as the current locale on /fr/i18n-test', () => {
      cy.visit('/fr/i18n-test')
      cy.get('[data-cy=current-locale]').should('have.text', 'fr')
    })

    it('switchLocalePath("en") from /fr/i18n-test produces /i18n-test', () => {
      cy.visit('/fr/i18n-test')
      cy.get('[data-cy=switch-to-en]').should('have.attr', 'href', '/i18n-test')
    })

    it('switchLocalePath("fr") on the fr-locale keeps the fr prefix', () => {
      cy.visit('/fr/i18n-test')
      cy.get('[data-cy=switch-to-fr]').should('have.attr', 'href', '/fr/i18n-test')
    })

    it('clicking the switch-to-en link navigates to the default-locale path', () => {
      cy.visit('/fr/i18n-test')
      cy.get('[data-cy=switch-to-en]').click({ force: true })
      cy.url().should('include', '/i18n-test')
      cy.url().should('not.include', '/fr/')
    })

    it('clicking the switch-to-fr link from /i18n-test navigates to /fr/i18n-test', () => {
      cy.visit('/i18n-test')
      cy.get('[data-cy=switch-to-fr]').click({ force: true })
      cy.url().should('include', '/fr/i18n-test')
    })
  })
})
