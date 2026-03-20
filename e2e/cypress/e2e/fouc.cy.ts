/**
 * FOUC (Flash of Unstyled Content) tests.
 *
 * For SSR and SSG modes, validates that the server-rendered HTML:
 * 1. Contains Declarative Shadow DOM templates
 * 2. Each shadow template has its own embedded <style> block
 * 3. Shadow DOM styles are NOT hoisted to <head> (which would break encapsulation)
 * 4. The loading indicator is NOT present in the initial HTML
 * 5. cer-layout-view has pre-rendered content (not empty)
 *
 * FOUC occurs when styles are missing from shadow roots on first parse.
 * These checks verify the DSD structure prevents FOUC before JS hydrates.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

// Routes to check for FOUC — all pre-renderable routes
const ROUTES_TO_CHECK = [
  '/',
  '/about',
  '/counter',
  '/head',
  '/blog',
  '/blog/first-post',
  '/blog/second-post',
  '/items/1',
  '/items/2',
  '/login',
]

describe('FOUC prevention', () => {
  before(() => {
    if (mode === 'spa') {
      cy.log('Skipping FOUC tests in SPA mode (no server-side rendering)')
    }
  })

  if (mode === 'spa') return

  ROUTES_TO_CHECK.forEach((path) => {
    it(`${path}: shadow templates have embedded styles (no FOUC)`, () => {
      cy.assertNoDSD_FOUC(path)
    })
  })

  it('DSD polyfill is placed after </cer-layout-view>, not inside it', () => {
    cy.request('/').then((response) => {
      const html: string = response.body
      const clvEnd = html.lastIndexOf('</cer-layout-view>')
      const polyfillIdx = html.indexOf('attachShadow')
      if (polyfillIdx >= 0) {
        expect(polyfillIdx, 'DSD polyfill must come AFTER </cer-layout-view>').to.be.greaterThan(clvEnd)
      }
    })
  })

  it('home page: loading indicator is not visible on first paint', () => {
    // The loading component (page-loading) should never appear in initial HTML.
    // If it does, it means isNavigating was true during SSR — a FOUC bug.
    cy.request('/').then((response) => {
      expect(response.body).not.to.include('page-loading')
      expect(response.body).not.to.include('data-cy="loading-indicator"')
    })
  })
})
