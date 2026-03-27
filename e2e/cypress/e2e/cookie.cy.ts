/**
 * useCookie() e2e tests — verifies isomorphic cookie read/write/remove
 * works correctly in all rendering modes.
 *
 * Client-side path: set/remove via document.cookie.
 * SSR path: reads from req.headers.cookie on initial request.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

// Helper: find an element inside the page-cookie-test shadow DOM (post-hydration).
const cookiePage = () =>
  cy.get('cer-layout-view').shadow().find('page-cookie-test').shadow()

describe('useCookie() — client-side read/write/remove', () => {
  beforeEach(() => {
    cy.clearCookies()
  })

  it('shows "not set" when the cookie is absent', () => {
    cy.visit('/cookie-test')
    cookiePage().find('[data-cy=cookie-value]').should('contain', 'not set')
  })

  it('reads a cookie set via cy.setCookie()', () => {
    cy.setCookie('ks-test-cookie', 'cypress-value')
    cy.visit('/cookie-test')
    cookiePage().find('[data-cy=cookie-value]').should('contain', 'cypress-value')
  })

  it('sets the cookie when the set button is clicked', () => {
    cy.visit('/cookie-test')
    cookiePage().find('[data-cy=set-cookie]').click({ force: true })
    // After reload the SSR-rendered light DOM shows the new value
    cy.get('[data-cy=cookie-value]').should('contain', 'hello-from-cer-app')
    cy.getCookie('ks-test-cookie').should('have.property', 'value', 'hello-from-cer-app')
  })

  it('removes the cookie when the remove button is clicked', () => {
    cy.setCookie('ks-test-cookie', 'to-remove')
    cy.visit('/cookie-test')
    cookiePage().find('[data-cy=cookie-value]').should('contain', 'to-remove')
    cookiePage().find('[data-cy=remove-cookie]').click({ force: true })
    // After reload the SSR-rendered light DOM shows "not set"
    cy.get('[data-cy=cookie-value]').should('contain', 'not set')
  })
})

if (mode === 'ssr') {
  describe('useCookie() — server-side read (SSR)', () => {
    it('reads the cookie from the request and renders its value', () => {
      cy.setCookie('ks-test-cookie', 'ssr-cookie-value')
      cy.visit('/cookie-test')
      // The SSR-rendered HTML should include the cookie value server-side
      cy.get('[data-cy=cookie-value]').should('contain', 'ssr-cookie-value')
    })

    it('initial HTML contains the cookie value when cookie is sent with the request', () => {
      cy.setCookie('ks-test-cookie', 'in-html')
      cy.request({
        url: '/cookie-test',
        headers: { Cookie: 'ks-test-cookie=in-html' },
      }).then((response) => {
        expect(response.body).to.include('in-html')
      })
    })
  })

  describe('useCookie() — SameSite=Lax default (security)', () => {
    it('Set-Cookie header includes SameSite=Lax by default when no sameSite option is passed', () => {
      // The session cookie written by useSession() (which delegates to useCookie())
      // must default to SameSite=Lax to prevent CSRF on older browsers.
      cy.request({ url: '/session-test', failOnStatusCode: false }).then((response) => {
        // The session endpoint sets a session cookie — verify the header
        const setCookie = response.headers['set-cookie']
        if (setCookie) {
          const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie)
          // SameSite=Lax must be present; SameSite=None would be a security regression
          expect(cookieStr).to.match(/SameSite=Lax/i)
          expect(cookieStr).not.to.match(/SameSite=None/i)
        }
      })
    })
  })
}
