/**
 * Tests for per-route render strategy (meta.render).
 *
 * render: 'server' — route is always SSR'd, skipped during SSG pre-rendering.
 * render: 'spa'    — route is served as SPA shell in SSR mode, skipped in SSG.
 * render: 'static' — serve pre-rendered HTML from disk; fall back to SSR.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

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
      // The route was skipped during SSG. The static preview falls back to
      // dist/index.html (SPA shell) rather than a pre-rendered page, so the
      // server-rendered heading is absent from the raw HTML response.
      cy.request('/render-server-test').then((response) => {
        expect(response.body).not.to.include('render-server-heading')
      })
    })
  }
})

// ─── render: 'spa' ────────────────────────────────────────────────────────────

describe('render: spa — client-only', () => {
  it('renders the page heading after JS boots', () => {
    cy.visit('/render-spa-test')
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
      cy.request('/render-spa-test').then((response) => {
        expect(response.body).not.to.include('render-spa-heading')
      })
    })
  }
})
