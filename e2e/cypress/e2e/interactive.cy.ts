/**
 * Interactivity tests — counter, navigation, middleware redirect.
 * All tests run in every build mode (SPA, SSR, SSG).
 */

const mode = Cypress.expose('mode') as 'spa' | 'ssr' | 'ssg'
const counterPage = () =>
  cy
    .get('page-counter')
    .should(($host) => {
      expect($host).to.have.attr('data-cer-hydrated')
    })
    .shadow()
const hydratedPage = (tag: string) =>
  cy
    .get(tag)
    .should(($host) => {
      expect($host).to.have.attr('data-cer-hydrated')
    })
    .shadow()

describe('Counter interactivity', () => {
  beforeEach(() => {
    cy.visit('/counter')
    // Wait for the component to hydrate and show count 0
    cy.get('page-counter').should('exist')
    cy.get('[data-cy=count]').should('contain', '0')
  })

  // Scope to cer-layout-view's shadow DOM to target only the reactive
  // retained DSD page host, which is upgraded in place without a duplicate copy.
  it('increments count on + click', () => {
    counterPage().find('[data-cy=increment]').click({ force: true })
    counterPage().find('[data-cy=count]').should('contain', '1')
  })

  it('decrements count on − click', () => {
    counterPage().find('[data-cy=increment]').click({ force: true })
    counterPage().find('[data-cy=increment]').click({ force: true })
    counterPage().find('[data-cy=count]').should('contain', '2')
    counterPage().find('[data-cy=decrement]').click({ force: true })
    counterPage().find('[data-cy=count]').should('contain', '1')
  })

  it('resets count on Reset click', () => {
    counterPage().find('[data-cy=increment]').click({ force: true })
    counterPage().find('[data-cy=increment]').click({ force: true })
    counterPage().find('[data-cy=count]').should('contain', '2')
    counterPage().find('[data-cy=reset]').click({ force: true })
    counterPage().find('[data-cy=count]').should('contain', '0')
  })

  it('multiple increments accumulate correctly', () => {
    counterPage().find('[data-cy=increment]').click({ force: true })
    counterPage().find('[data-cy=increment]').click({ force: true })
    counterPage().find('[data-cy=increment]').click({ force: true })
    counterPage().find('[data-cy=count]').should('contain', '3')
  })
})

describe('Client-side navigation', () => {
  it('navigates from home to about via nav link', () => {
    cy.visit('/')
    cy.get('[data-cy=nav-about]').first().click({ force: true })
    cy.url().should('include', '/about')
    cy.get('[data-cy=about-heading]').should('contain', 'About')
  })

  it('navigates from home to counter via nav link', () => {
    cy.visit('/')
    cy.get('[data-cy=nav-counter]').first().click({ force: true })
    cy.url().should('include', '/counter')
    cy.get('[data-cy=counter-heading]').should('contain', 'Counter')
  })

  it('navigates from home to blog via nav link', () => {
    cy.visit('/')
    cy.get('[data-cy=nav-blog]').first().click({ force: true })
    cy.url().should('include', '/blog')
    cy.get('[data-cy=blog-heading]').should('contain', 'Blog')
  })

  it('navigates from blog to a post via link click', () => {
    cy.visit('/blog')
    hydratedPage('page-blog').find('[data-cy=blog-item]').first().find('a').first().click()
    cy.url().should('include', '/blog/')
    cy.get('[data-cy=post-title]').should('exist')
  })

  it('navigates back from about to home', () => {
    cy.visit('/about')
    hydratedPage('page-about').find('[data-cy=about-back]').click()
    cy.url().should('eq', Cypress.config('baseUrl') + '/')
    cy.get('[data-cy=home-heading]').should('contain', 'Kitchen Sink')
  })

  it('counter state resets when navigating away and back', () => {
    cy.visit('/counter')
    cy.get('page-counter').should('exist')
    counterPage().find('[data-cy=increment]').click({ force: true })
    counterPage().find('[data-cy=count]').should('contain', '1')
    // Navigate away
    cy.get('[data-cy=nav-home]').first().click({ force: true })
    cy.url().should('eq', Cypress.config('baseUrl') + '/')
    cy.get('[data-cy=home-heading]').should('contain', 'Kitchen Sink')
    // Navigate back — component re-mounts, state resets
    cy.get('[data-cy=nav-counter]').first().click({ force: true })
    cy.url().should('include', '/counter')
    cy.get('page-counter').should('exist')
    counterPage().find('[data-cy=count]').should('contain', '0')
  })
})

describe('Auth middleware', () => {
  beforeEach(() => {
    cy.clearLocalStorage()
  })

  it('redirects to /login when not authenticated', () => {
    cy.visit('/protected')
    cy.url().should('include', '/login')
    cy.get('page-login', { timeout: 8000 }).should('exist')
    cy.get('[data-cy=login-heading]').should('contain', 'Login')
  })

  it('shows protected page when token is set', () => {
    cy.window().then((win) => win.localStorage.setItem('ks-token', '1'))
    cy.visit('/protected')
    cy.url().should('include', '/protected')
    cy.get('[data-cy=protected-heading]').should('contain', 'Protected Page')
  })

  it('shows plugin greeting on protected page', () => {
    cy.window().then((win) => win.localStorage.setItem('ks-token', '1'))
    cy.visit('/protected')
    cy.get('[data-cy=plugin-greeting]').should('contain', 'Hello from ks-setup plugin!')
  })
})

if (mode !== 'spa') {
  describe('Plugin provide/inject — server-side rendering', () => {
    it('plugin greeting is present in the initial server HTML', () => {
      // Auth middleware is client-side only, so the server renders /protected
      // unconditionally. This verifies useInject() reads from __cerPluginProvides
      // during the SSR render pass (before any client JS runs).
      cy.request('/protected').then((resp) => {
        expect(resp.body).to.include('Hello from ks-setup plugin!')
      })
    })
  })
}
