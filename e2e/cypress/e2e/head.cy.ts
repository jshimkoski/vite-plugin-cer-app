/**
 * useHead() tests — verifies document title and meta tags are set correctly.
 *
 * In SSR/SSG: tags should be in the initial HTML (server-side injection).
 * In all modes: tags should be set after client-side hydration.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

describe('useHead() — document title', () => {
  it('sets title to "Home — Kitchen Sink" on home page', () => {
    cy.visit('/')
    cy.title().should('eq', 'Home — Kitchen Sink')
  })

  it('sets title to "About — Kitchen Sink" on about page', () => {
    cy.visit('/about')
    cy.title().should('eq', 'About — Kitchen Sink')
  })

  it('sets title to "Head Test — Kitchen Sink" on head page', () => {
    cy.visit('/head')
    cy.title().should('eq', 'Head Test — Kitchen Sink')
  })

  it('sets title to "Blog — Kitchen Sink" on blog list page', () => {
    cy.visit('/blog')
    cy.title().should('eq', 'Blog — Kitchen Sink')
  })

  it('updates title when navigating between pages', () => {
    cy.visit('/')
    cy.title().should('eq', 'Home — Kitchen Sink')
    cy.get('[data-cy=nav-about]').first().click({ force: true })
    cy.title().should('eq', 'About — Kitchen Sink')
    cy.get('[data-cy=about-back]').first().click({ force: true })
    cy.title().should('eq', 'Home — Kitchen Sink')
  })
})

describe('useHead() — meta tags', () => {
  it('sets meta description on home page', () => {
    cy.visit('/')
    cy.get('meta[name="description"]').should('have.attr', 'content', 'Kitchen sink test app.')
  })

  it('sets meta description on about page', () => {
    cy.visit('/about')
    cy.get('meta[name="description"]').should('have.attr', 'content', 'About the kitchen sink test app.')
  })

  it('sets meta description on head test page', () => {
    cy.visit('/head')
    cy.get('meta[name="description"]').should('have.attr', 'content', 'A test page for useHead().')
  })

  it('sets og:title meta on head test page', () => {
    cy.visit('/head')
    cy.get('meta[property="og:title"]').should('have.attr', 'content', 'Head Test')
  })
})

if (mode !== 'spa') {
  describe('useHead() — server-side injection (SSR/SSG)', () => {
    it('home page title is in the initial HTML', () => {
      cy.request('/').then((response) => {
        expect(response.body).to.include('<title>Home — Kitchen Sink</title>')
      })
    })

    it('about page title is in the initial HTML', () => {
      cy.request('/about').then((response) => {
        expect(response.body).to.include('<title>About — Kitchen Sink</title>')
      })
    })

    it('head test page title is in the initial HTML', () => {
      cy.request('/head').then((response) => {
        expect(response.body).to.include('<title>Head Test — Kitchen Sink</title>')
      })
    })

    it('meta description is in the initial HTML for home', () => {
      cy.request('/').then((response) => {
        expect(response.body).to.include('Kitchen sink test app.')
      })
    })
  })
}
