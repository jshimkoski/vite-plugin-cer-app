/**
 * usePageData() timing regression tests — proves the queueMicrotask fix.
 *
 * Background:
 *   _doHydrate() runs _loadPageForPath (sets __CER_DATA__) then _replace(),
 *   which causes cer-layout-view to create a NEW page element via a queued
 *   microtask. That new element's setup() calls usePageData() to read __CER_DATA__.
 *
 *   Pre-fix:  delete __CER_DATA__ was synchronous → ran before the queued render
 *             → usePageData() saw undefined → returned null.
 *   Post-fix: queueMicrotask(() => delete __CER_DATA__) → delete is queued AFTER
 *             the render microtask → usePageData() reads the data correctly.
 *
 * Proof mechanism:
 *   Each blog page component captures `ssrData ? 'ssr' : 'client'` once, at the
 *   moment the element is created during hydration. In SSR/SSG/dev modes this
 *   value must always be 'ssr'. If it is 'client' the timing bug has regressed.
 */

export {}

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg' | 'dev'

// ─── Blog list — hard refresh ─────────────────────────────────────────────

describe('usePageData() — blog list hard refresh', () => {
  if (mode !== 'spa') {
    it('server response embeds __CER_DATA__ with both post titles', () => {
      cy.request('/blog').then((res) => {
        expect(res.body).to.include('__CER_DATA__')
        expect(res.body).to.include('First Post')
        expect(res.body).to.include('Second Post')
      })
    })

    it('usePageData() is non-null during hydration re-render (data-source = "ssr")', () => {
      cy.visit('/blog')
      // Scope to the live shadow DOM (not the DSD pre-render copy) so the assertion
      // targets the element created during hydration where usePageData() was called.
      // 'ssr' proves queueMicrotask deferred the delete until after the render ran.
      cy.get('cer-layout-view').shadow().find('page-blog').shadow()
        .find('[data-cy=blog-data-source]').should('have.text', 'ssr')
    })
  }

  // In SSR and dev modes the /api/posts route exists on the server.
  // If usePageData() is non-null, the blog page's useOnConnected guard
  // (`if (ssrData) return`) skips the fetch entirely.
  if (mode === 'ssr' || mode === 'dev') {
    it('no /api/posts network request is made — usePageData() skips client fetch', () => {
      cy.intercept('GET', '/api/posts').as('apiFetch')
      cy.visit('/blog')
      // Wait for the page component to fully hydrate before asserting no requests.
      cy.get('cer-layout-view').shadow().find('page-blog').shadow()
        .find('[data-cy=blog-list]').should('exist')
      cy.get('@apiFetch.all').should('have.length', 0)
    })
  }

  it('blog posts are visible after hydration (all modes)', () => {
    cy.visit('/blog')
    cy.get('[data-cy=blog-item]', { timeout: 8000 }).should('have.length.at.least', 2)
  })
})

// ─── Blog detail — hard refresh ───────────────────────────────────────────

describe('usePageData() — blog detail hard refresh', () => {
  if (mode !== 'spa') {
    it('server response embeds __CER_DATA__ with post detail', () => {
      cy.request('/blog/first-post').then((res) => {
        expect(res.body).to.include('__CER_DATA__')
        expect(res.body).to.include('First Post')
      })
    })

    it('usePageData() is non-null during hydration re-render on detail page', () => {
      cy.visit('/blog/first-post')
      cy.get('cer-layout-view').shadow().find('page-blog-slug').shadow()
        .find('[data-cy=blog-detail-data-source]').should('have.text', 'ssr')
    })
  }

  if (mode === 'ssr' || mode === 'dev') {
    it('no /api/posts/:slug network request is made — usePageData() skips client fetch', () => {
      cy.intercept('GET', '/api/posts/*').as('apiPostDetail')
      cy.visit('/blog/first-post')
      cy.get('cer-layout-view').shadow().find('page-blog-slug').shadow()
        .find('[data-cy=post-title]').should('exist')
      cy.get('@apiPostDetail.all').should('have.length', 0)
    })
  }

  it('"First Post" title renders on hard refresh (all modes)', () => {
    cy.visit('/blog/first-post')
    cy.get('[data-cy=post-title]', { timeout: 8000 }).should('contain', 'First Post')
  })

  it('"Second Post" title renders on hard refresh (all modes)', () => {
    cy.visit('/blog/second-post')
    cy.get('[data-cy=post-title]', { timeout: 8000 }).should('contain', 'Second Post')
  })
})

// ─── Client-side navigation (post-hydration data loading) ─────────────────

describe('usePageData() — client-side navigation', () => {
  it('navigating to blog from home shows posts', () => {
    cy.visit('/')
    cy.get('[data-cy=page-nav]').find('a[href="/blog"]').first().click({ force: true })
    cy.get('[data-cy=blog-item]', { timeout: 8000 }).should('have.length.at.least', 2)
  })

  it('navigating between blog posts loads correct data each time', () => {
    cy.visit('/blog/first-post')
    cy.get('[data-cy=post-title]', { timeout: 8000 }).should('contain', 'First Post')
    cy.get('[data-cy=post-back]').first().click({ force: true })
    cy.url().should('include', '/blog')
    cy.get('[data-cy=blog-link-second-post]', { timeout: 8000 }).first().click({ force: true })
    cy.get('[data-cy=post-title]', { timeout: 8000 }).should('contain', 'Second Post')
  })
})
