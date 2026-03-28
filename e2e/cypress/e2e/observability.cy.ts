/**
 * Observability hooks e2e tests.
 *
 * Log-based tests (onRequest / onResponse firing) only run in SSR mode because
 * SSG serves pre-built static files — the Node.js SSR handler is never called,
 * so the hooks never fire. SPA mode also has no server-side render pass.
 *
 * The private-config browser enforcement tests run in all modes.
 */

const LOG_FILE = '/tmp/cer-hooks-test.log'
const isSSR = () => Cypress.env('mode') === 'ssr'

describe('Observability hooks — log output (SSR only)', () => {
  before(() => {
    if (!isSSR()) return
    // Clear the log file so each run starts clean.
    cy.writeFile(LOG_FILE, '')
  })

  it('fires onRequest and onResponse for a successful page request', function () {
    if (!isSSR()) return this.skip()
    cy.request('/observability-test').then(() => {
      cy.readFile(LOG_FILE).then((log: string) => {
        expect(log).to.match(/REQUEST GET \/observability-test/)
        expect(log).to.match(/RESPONSE 200 GET \/observability-test \d+ms/)
      })
    })
  })

  it('onResponse includes a non-negative duration in milliseconds', function () {
    if (!isSSR()) return this.skip()
    cy.writeFile(LOG_FILE, '')
    cy.request('/').then(() => {
      cy.readFile(LOG_FILE).then((log: string) => {
        const match = log.match(/RESPONSE \d+ GET \/ (\d+)ms/)
        expect(match).to.not.be.null
        const duration = parseInt(match![1], 10)
        expect(duration).to.be.gte(0)
      })
    })
  })

  it('does not write an ERROR entry for a normal request', function () {
    if (!isSSR()) return this.skip()
    cy.writeFile(LOG_FILE, '')
    cy.request('/').then(() => {
      cy.readFile(LOG_FILE).then((log: string) => {
        expect(log).not.to.include('ERROR')
      })
    })
  })
})

describe('Observability hooks — server stability', () => {
  it('pages render correctly when hooks are defined (hooks do not crash the server)', () => {
    cy.visit('/observability-test')
    cy.get('[data-cy=observability-heading]').should('contain', 'Observability Test')
  })
})

describe('Private config browser enforcement', () => {
  it('renders runtimeConfig.public values on the page', () => {
    cy.visit('/observability-test')
    cy.get('[data-cy=public-app-name]').should('contain', 'Kitchen Sink')
  })

  it('throws a Proxy error when .private is accessed in a browser context', () => {
    cy.visit('/observability-test')
    // After client-side hydration the component catches the Proxy error and
    // renders it in [data-cy=private-proxy-error].
    cy.get('[data-cy=private-proxy-error]').should(
      'contain',
      'runtimeConfig.private is not available in the browser',
    )
  })
})
