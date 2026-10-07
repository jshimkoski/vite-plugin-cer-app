/**
 * Tests for per-route render strategy (meta.render).
 *
 * render: 'server' — route is always SSR'd, skipped during SSG pre-rendering.
 * render: 'spa'    — route is served as SPA shell in SSR mode, skipped in SSG.
 * render: 'static' — serve pre-rendered HTML from disk; fall back to SSR.
 */

const mode = Cypress.expose('mode') as 'spa' | 'ssr' | 'ssg'

// ─── render: 'server' ─────────────────────────────────────────────────────────

describe('render: server — always SSR', () => {
  it('renders the page in SSR mode', () => {
    if (mode !== 'ssr') return
    cy.visit('/render-server-test')
    cy.get('[data-cy=render-server-heading]').should('contain', 'Render Server Test')
  })

  it('renders the page in SPA mode (client-side navigation)', () => {
    if (mode !== 'spa') return
    cy.visit('/render-server-test')
    cy.get('[data-cy=render-server-heading]').should('contain', 'Render Server Test')
  })

  if (mode === 'ssr') {
    it('pre-renders the page in the initial HTML (SSR)', () => {
      cy.request('/render-server-test').then((response) => {
        expect(response.body).to.include('render-server-heading')
        expect(response.body).to.include('Render Server Test')
      })
    })
  }

  if (mode === 'ssg') {
    it('route with render:server is not pre-rendered — not found in ssg dist', () => {
      // The hybrid fixture retains SSR fallback, while the route stays out of SSG output.
      cy.readFile('e2e/kitchen-sink/dist/ssg-manifest.json').its('paths').should('not.include', '/render-server-test')
      cy.request({ url: '/ssg-manifest.json', failOnStatusCode: false }).its('status').should('equal', 404)
      cy.request({ url: '/render-server-test', failOnStatusCode: false }).then((response) => {
        expect(response.status).to.equal(200)
        expect(response.body).to.include('render-server-heading')
      })
    })
  }
})

// ─── render: 'spa' ────────────────────────────────────────────────────────────

describe('render: spa — client-only', () => {
  it('renders the page heading after JS boots', () => {
    cy.visit('/render-spa-test', { failOnStatusCode: mode !== 'ssg' })
    cy.get('[data-cy=render-spa-heading]').should('contain', 'Render SPA Test')
  })

  if (mode === 'ssr') {
    it('raw HTML response is the SPA shell (no SSR content)', () => {
      cy.request('/render-spa-test').then((response) => {
        expect(response.body).not.to.include('render-spa-heading')
      })
    })
  }

  if (mode === 'ssg') {
    it('route with render:spa is not pre-rendered — not found in ssg dist', () => {
      cy.readFile('e2e/kitchen-sink/dist/ssg-manifest.json').its('paths').should('not.include', '/render-spa-test')
      cy.request({ url: '/render-spa-test', failOnStatusCode: false }).then((response) => {
        expect(response.status).to.equal(200)
        expect(response.body).not.to.include('render-spa-heading')
      })
    })
  }
})
