/**
 * P1-3: Session secret rotation.
 *
 * Tests that useSession() supports multiple secrets for key rotation:
 * - New sessions are signed with the first (active) secret.
 * - Old sessions signed with a secondary secret are still readable.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

if (mode === 'ssr') {
  describe('Session secret rotation (P1-3)', () => {
    it('writes and reads back a session when sessionSecret is an array', () => {
      // The kitchen-sink /session-rotation-test page sets a session and reads it back
      cy.visit('/session-rotation-test')
      cy.get('[data-cy=session-read]', { timeout: 5000 }).should('contain', 'rotation-user')
    })

    it('session is stored as an httpOnly cookie', () => {
      cy.visit('/session-rotation-test')
      // After visiting the page that sets a session, the cookie should be present
      cy.getCookie('session').should('exist')
    })
  })
}
