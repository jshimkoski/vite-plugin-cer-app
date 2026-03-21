/**
 * Tests for ISR (Incremental Static Regeneration), nested layouts, and
 * runtimeConfig — features added alongside Nuxt/Next parity improvements.
 *
 * ISR and runtimeConfig tests only run in SSR mode (preview server).
 * Nested-layout tests run in all modes.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

// ─── ISR (preview server only) ────────────────────────────────────────────────

if (mode === 'ssr') {
  describe('ISR — stale-while-revalidate cache', () => {
    it('request to a route with revalidate returns X-Cache: HIT', () => {
      // On first render (cache miss) the server renders, caches, then serves
      // from cache — so all requests within the TTL return HIT.
      cy.request('/blog/first-post').then((response) => {
        expect(response.headers['x-cache']).to.equal('HIT')
      })
    })

    it('subsequent requests within TTL also return X-Cache: HIT', () => {
      cy.request('/blog/first-post')
      cy.request('/blog/first-post').then((response) => {
        expect(response.headers['x-cache']).to.equal('HIT')
      })
    })

    it('X-Cache header is absent on non-revalidate routes', () => {
      cy.request('/about').then((response) => {
        expect(response.headers).not.to.have.property('x-cache')
      })
    })

    // /isr-test uses revalidate: 0 — ISR is always engaged. The first request
    // returns HIT (cold cache) or STALE (warm cache from a previous test run),
    // but x-cache is always present. Exact HIT/STALE distinction for a cold
    // cache is covered by unit tests (createIsrHandler).
    it('revalidate:0 route always has X-Cache header (ISR engaged)', () => {
      cy.request('/isr-test').then((response) => {
        expect(['HIT', 'STALE']).to.include(response.headers['x-cache'])
      })
    })

    it('second request to a revalidate:0 route returns X-Cache: STALE', () => {
      cy.request('/isr-test') // prime the cache
      cy.request('/isr-test').then((response) => {
        expect(response.headers['x-cache']).to.equal('STALE')
      })
    })
  })
}

// ─── Nested layouts ────────────────────────────────────────────────────────────

describe('Nested layouts — admin section', () => {
  it('renders the admin dashboard page', () => {
    cy.visit('/admin/dashboard')
    cy.get('[data-cy=admin-dashboard-heading]').should('contain', 'Admin Dashboard')
  })

  it('renders the outer default layout (site-header, site-nav)', () => {
    cy.visit('/admin/dashboard')
    cy.get('[data-cy=site-header]').should('exist')
    cy.get('[data-cy=site-nav]').should('exist')
  })

  it('renders the inner admin layout (admin-sidebar, admin-content)', () => {
    cy.visit('/admin/dashboard')
    cy.get('[data-cy=admin-layout]').should('exist')
    cy.get('[data-cy=admin-sidebar]').should('exist')
    cy.get('[data-cy=admin-content]').should('exist')
  })

  it('layout-admin is a DOM child of layout-default (layout chain order)', () => {
    // Verifies the chain ['default', 'admin'] is rendered outermost-first.
    // layout-admin must be in the light DOM of layout-default, not the other
    // way around. A CSS descendant selector proves this without needing to
    // pierce slot boundaries.
    cy.visit('/admin/dashboard')
    cy.get('layout-default layout-admin').should('exist')
  })

  if (mode !== 'spa') {
    it('admin layout is pre-rendered in initial HTML (SSR/SSG)', () => {
      cy.request('/admin/dashboard').then((response) => {
        expect(response.body).to.include('admin-layout')
        expect(response.body).to.include('Admin Dashboard')
      })
    })
  }
})

// ─── runtimeConfig ─────────────────────────────────────────────────────────────

describe('runtimeConfig.public', () => {
  it('renders the appName from runtimeConfig on the admin dashboard', () => {
    cy.visit('/admin/dashboard')
    cy.get('[data-cy=admin-app-name]').should('contain', 'Kitchen Sink')
  })
})
