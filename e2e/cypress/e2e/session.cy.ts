/**
 * useSession() e2e tests — verifies that HMAC-signed cookie sessions
 * round-trip correctly across requests via the /api/session endpoint.
 *
 * The kitchen-sink exposes:
 *   GET    /api/session  → { userId: string | null }
 *   POST   /api/session  → creates session with userId = 'test-user'
 *   DELETE /api/session  → clears the session
 *
 * Sessions require a server-side signing key, so these tests only run in
 * SSR mode where the session secret is available.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

if (mode === 'ssr') {
  describe('useSession() — session create / read / clear (SSR)', () => {
    beforeEach(() => {
      cy.clearCookies()
    })

    it('GET /api/session returns null userId when no session cookie is set', () => {
      cy.request('/api/session').then((response) => {
        expect(response.status).to.eq(200)
        expect(response.body.userId).to.be.null
      })
    })

    it('POST /api/session creates a session cookie', () => {
      cy.request({ method: 'POST', url: '/api/session' }).then((response) => {
        expect(response.status).to.eq(200)
        expect(response.body.ok).to.be.true
      })
      // Cookie should now be present
      cy.getCookie('session').should('exist')
    })

    it('GET /api/session returns userId after session is created', () => {
      // Create session
      cy.request({ method: 'POST', url: '/api/session' })
      // Read session — Cypress automatically forwards the cookie
      cy.request('/api/session').then((response) => {
        expect(response.body.userId).to.eq('test-user')
      })
    })

    it('DELETE /api/session clears the session', () => {
      // Create then clear
      cy.request({ method: 'POST', url: '/api/session' })
      cy.request({ method: 'DELETE', url: '/api/session' })
      // Reading again should return null
      cy.request('/api/session').then((response) => {
        expect(response.body.userId).to.be.null
      })
    })

    it('session persists across multiple requests in the same Cypress session', () => {
      cy.request({ method: 'POST', url: '/api/session' })
      // Make several read requests — all should see the same userId
      cy.request('/api/session').its('body.userId').should('eq', 'test-user')
      cy.request('/api/session').its('body.userId').should('eq', 'test-user')
    })

    it('tampered session cookie causes GET to return null userId', () => {
      cy.request({ method: 'POST', url: '/api/session' })
      // Overwrite the cookie with garbage
      cy.setCookie('session', 'tampered.invalidsig')
      cy.request('/api/session').then((response) => {
        expect(response.body.userId).to.be.null
      })
    })
  })
}
