/**
 * SSG stylesheet inlining is a build-only optimization. Cypress is intentionally
 * gated to the SSG preview because SPA and SSR builds keep external stylesheets.
 */
describe('SSG stylesheet inlining', () => {
  before(function () {
    if ((Cypress.expose('mode') as string) !== 'ssg') this.skip()
  })

  it('embeds the generated application stylesheet in the HTML response', () => {
    cy.request('/').its('body').then((html: string) => {
      expect(html).to.include('data-cer-inline-source="/assets/')
      expect(html).not.to.match(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/i)
    })
  })

  it('keeps the page styled when loaded from the static preview', () => {
    cy.visit('/')
    cy.get('style[data-cer-inline-source]').should('exist')
    cy.get('body').should('be.visible')
  })
})
