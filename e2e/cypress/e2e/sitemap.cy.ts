/**
 * Sitemap tests — verifies sitemap.xml is generated correctly in SSG mode.
 * Skipped in SPA and SSR modes where sitemap generation does not apply.
 */

describe('sitemap.xml', { testIsolation: false }, () => {
  before(function () {
    if ((Cypress.expose('mode') as string) !== 'ssg') this.skip()
  })

  it('is accessible at /sitemap.xml', () => {
    cy.request('/sitemap.xml').its('status').should('eq', 200)
  })

  it('contains a valid XML declaration', () => {
    cy.request('/sitemap.xml').its('body').should('contain', '<?xml version="1.0" encoding="UTF-8"?>')
  })

  it('contains a urlset with the sitemap protocol namespace', () => {
    cy.request('/sitemap.xml')
      .its('body')
      .should('contain', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  })

  it('contains a <loc> for the home page using the siteUrl', () => {
    cy.request('/sitemap.xml')
      .its('body')
      .should('contain', '<loc>https://example.com</loc>')
  })

  it('does not fabricate build-date <lastmod> entries', () => {
    cy.request('/sitemap.xml').its('body').should('not.contain', '<lastmod>')
  })

  it('contains multiple <url> entries', () => {
    cy.request('/sitemap.xml').its('body').then((body: string) => {
      const count = (body.match(/<url>/g) ?? []).length
      expect(count).to.be.greaterThan(1)
    })
  })
})
