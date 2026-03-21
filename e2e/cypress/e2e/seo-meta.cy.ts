/**
 * useSeoMeta() e2e tests — verifies Open Graph, Twitter Card, canonical, and
 * title/description tags are injected correctly in all modes.
 *
 * In SSR/SSG: tags must be present in the initial server-rendered HTML.
 * In all modes: tags must be present after client hydration.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

describe('useSeoMeta() — title and description', () => {
  it('sets document title', () => {
    cy.visit('/seo-test')
    cy.title().should('eq', 'SEO Test — Kitchen Sink')
  })

  it('sets meta description', () => {
    cy.visit('/seo-test')
    cy.get('meta[name="description"]').should('have.attr', 'content', 'A test page for useSeoMeta().')
  })
})

describe('useSeoMeta() — Open Graph tags', () => {
  it('sets og:title', () => {
    cy.visit('/seo-test')
    cy.get('meta[property="og:title"]').should('have.attr', 'content', 'SEO Test OG Title')
  })

  it('sets og:description', () => {
    cy.visit('/seo-test')
    cy.get('meta[property="og:description"]').should('have.attr', 'content', 'SEO Test OG description.')
  })

  it('sets og:image', () => {
    cy.visit('/seo-test')
    cy.get('meta[property="og:image"]').should('have.attr', 'content', 'https://example.com/og/seo-test.png')
  })

  it('sets og:url', () => {
    cy.visit('/seo-test')
    cy.get('meta[property="og:url"]').should('have.attr', 'content', 'https://example.com/seo-test')
  })

  it('sets og:type', () => {
    cy.visit('/seo-test')
    cy.get('meta[property="og:type"]').should('have.attr', 'content', 'website')
  })

  it('sets og:site_name', () => {
    cy.visit('/seo-test')
    cy.get('meta[property="og:site_name"]').should('have.attr', 'content', 'Kitchen Sink')
  })
})

describe('useSeoMeta() — Twitter Card tags', () => {
  it('sets twitter:card', () => {
    cy.visit('/seo-test')
    cy.get('meta[name="twitter:card"]').should('have.attr', 'content', 'summary_large_image')
  })

  it('sets twitter:title', () => {
    cy.visit('/seo-test')
    cy.get('meta[name="twitter:title"]').should('have.attr', 'content', 'SEO Test Twitter Title')
  })

  it('sets twitter:site', () => {
    cy.visit('/seo-test')
    cy.get('meta[name="twitter:site"]').should('have.attr', 'content', '@ks')
  })
})

describe('useSeoMeta() — canonical link', () => {
  it('sets canonical link element', () => {
    cy.visit('/seo-test')
    cy.get('link[rel="canonical"]').should('have.attr', 'href', 'https://example.com/seo-test')
  })
})

if (mode !== 'spa') {
  describe('useSeoMeta() — server-side injection (SSR/SSG)', () => {
    it('title is in the initial HTML', () => {
      cy.request('/seo-test').then((response) => {
        expect(response.body).to.include('<title>SEO Test — Kitchen Sink</title>')
      })
    })

    it('og:title meta is in the initial HTML', () => {
      cy.request('/seo-test').then((response) => {
        expect(response.body).to.include('og:title')
        expect(response.body).to.include('SEO Test OG Title')
      })
    })

    it('twitter:card meta is in the initial HTML', () => {
      cy.request('/seo-test').then((response) => {
        expect(response.body).to.include('twitter:card')
        expect(response.body).to.include('summary_large_image')
      })
    })

    it('canonical link is in the initial HTML', () => {
      cy.request('/seo-test').then((response) => {
        expect(response.body).to.include('canonical')
        expect(response.body).to.include('https://example.com/seo-test')
      })
    })
  })
}
