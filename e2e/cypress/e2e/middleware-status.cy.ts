/**
 * P1-2: Server middleware status code extraction.
 *
 * When a server middleware throws an object with a `.status` field the
 * response should use that status code rather than defaulting to 500.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

if (mode === 'ssr') {
  describe('Server middleware status codes (P1-2)', () => {
    it('returns the status code thrown by server middleware (401)', () => {
      cy.request({
        url: '/middleware-status-test',
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401)
      })
    })

    it('does not return 500 when middleware throws a custom status', () => {
      cy.request({
        url: '/middleware-status-test',
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.not.eq(500)
      })
    })
  })
}
