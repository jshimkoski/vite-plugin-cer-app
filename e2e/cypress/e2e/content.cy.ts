/**
 * Content layer e2e tests — exercises queryContent() and useContentSearch().
 *
 * Pages under test:
 *   /content-index  — queryContent().find()  (all content)
 *   /content-blog   — queryContent('/blog').find() (blog prefix, draft exclusion)
 *   /content-doc    — queryContent('/docs/getting-started').first() (body + TOC)
 *   /content-search — useContentSearch() (MiniSearch, client-side)
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

// ─── /content-index ───────────────────────────────────────────────────────────

describe('Content index — queryContent().find()', () => {
  if (mode !== 'spa') {
    it('pre-renders content items in initial HTML (SSR/SSG)', () => {
      cy.request('/content-index').then((response) => {
        expect(response.body).to.include('Welcome')
        expect(response.body).to.include('Hello World')
      })
    })
  }

  it('renders at least 3 content items after hydration', () => {
    cy.visit('/content-index')
    cy.get('[data-cy=content-list]').should('exist')
    cy.get('[data-cy=content-item]', { timeout: 8000 }).should('have.length.at.least', 3)
  })

  it('shows total item count', () => {
    cy.visit('/content-index')
    // Use .should() so Cypress retries until the text updates (handles
    // the case where the client-side fetch updates the count after hydration).
    cy.get('[data-cy=content-total]', { timeout: 8000 })
      .invoke('text')
      .should((text) => {
        const n = parseInt(text.replace(/\D/g, ''), 10)
        expect(n).to.be.at.least(3)
      })
  })

  it('each item has a data-path attribute', () => {
    cy.visit('/content-index')
    cy.get('[data-cy=content-item]', { timeout: 8000 }).first().should('have.attr', 'data-path')
  })

  it('root content item appears with title "Welcome"', () => {
    cy.visit('/content-index')
    cy.get('[data-cy=content-item][data-path="/"]', { timeout: 8000 }).should('exist')
    cy.get('[data-cy=content-item][data-path="/"] [data-cy=content-item-title]').should('contain', 'Welcome')
  })
})

// ─── /content-blog ────────────────────────────────────────────────────────────

describe('Content blog listing — queryContent("/blog").find()', () => {
  if (mode !== 'spa') {
    it('pre-renders blog posts in initial HTML (SSR/SSG)', () => {
      cy.request('/content-blog').then((response) => {
        expect(response.body).to.include('Hello World')
      })
    })

    it('does not pre-render draft post in initial HTML (SSR/SSG)', () => {
      cy.request('/content-blog').then((response) => {
        expect(response.body).not.to.include('Draft Post')
      })
    })
  }

  it('renders blog posts after hydration', () => {
    cy.visit('/content-blog')
    cy.get('[data-cy=content-blog-list]').should('exist')
    cy.get('[data-cy=content-blog-item]', { timeout: 8000 }).should('have.length.at.least', 1)
  })

  it('shows Hello World post', () => {
    cy.visit('/content-blog')
    cy.get('[data-cy=content-blog-title]', { timeout: 8000 }).first().should('contain', 'Hello World')
  })

  it('does not show draft post', () => {
    cy.visit('/content-blog')
    cy.get('[data-cy=content-blog-list]', { timeout: 8000 })
    cy.get('[data-cy=content-blog-item][data-path="/blog/2026-04-02-draft"]').should('not.exist')
    cy.get('[data-cy=content-blog-title]').each(($el) => {
      expect($el.text()).not.to.include('Draft Post')
    })
  })

  it('blog items have data-path starting with /blog', () => {
    cy.visit('/content-blog')
    cy.get('[data-cy=content-blog-item]', { timeout: 8000 }).each(($el) => {
      const path = $el.attr('data-path') ?? ''
      expect(path).to.match(/^\/blog/)
    })
  })
})

// ─── /content-doc ─────────────────────────────────────────────────────────────

describe('Content doc — queryContent("/docs/getting-started").first()', () => {
  if (mode !== 'spa') {
    it('pre-renders doc title in initial HTML (SSR/SSG)', () => {
      cy.request('/content-doc').then((response) => {
        expect(response.body).to.include('Getting Started')
      })
    })

    it('pre-renders heading "Installation" in initial HTML (SSR/SSG)', () => {
      cy.request('/content-doc').then((response) => {
        expect(response.body).to.include('Installation')
      })
    })
  }

  it('renders doc title after hydration', () => {
    cy.visit('/content-doc')
    cy.get('[data-cy=content-doc-title]', { timeout: 8000 }).should('contain', 'Getting Started')
  })

  it('renders doc description', () => {
    cy.visit('/content-doc')
    cy.get('[data-cy=content-doc-desc]', { timeout: 8000 }).should('contain', 'install')
  })

  it('renders TOC with at least 2 entries', () => {
    cy.visit('/content-doc')
    cy.get('[data-cy=content-doc-toc-item]', { timeout: 8000 }).should('have.length.at.least', 2)
  })

  it('TOC links have href with # anchor', () => {
    cy.visit('/content-doc')
    cy.get('[data-cy=content-doc-toc-link]', { timeout: 8000 }).each(($el) => {
      const href = $el.attr('href') ?? ''
      expect(href).to.match(/^#/)
    })
  })

  it('TOC has Installation entry', () => {
    cy.visit('/content-doc')
    cy.get('[data-cy=content-doc-toc-item]', { timeout: 8000 }).contains('Installation')
  })

  it('body contains rendered HTML with heading ids', () => {
    cy.visit('/content-doc')
    cy.get('[data-cy=content-doc-body]', { timeout: 8000 }).first().within(() => {
      cy.get('h2[id]').should('have.length.at.least', 1)
    })
  })

  it('body contains "Installation" heading', () => {
    cy.visit('/content-doc')
    cy.get('[data-cy=content-doc-body]', { timeout: 8000 }).contains('h2', 'Installation')
  })
})

// ─── /content-search ──────────────────────────────────────────────────────────

// Helper: set the search input value and fire the input event.
// We navigate directly to the shadow root of page-content-search to get
// exactly one element (the JS-hydrated input with the @input listener).
function setSearchQuery(value: string) {
  cy.get('cer-layout-view').shadow().find('page-content-search').shadow()
    .find('[data-cy=content-search-input]')
    .invoke('val', value)
    .trigger('input', { force: true })
}

describe('Content search — useContentSearch()', () => {
  // Before each search test, intercept the pre-built search index so we can
  // wait for the component's useOnConnected pre-warm to complete (signals full
  // hydration).  useContentSearch loads /_content/search-index.json (not the
  // manifest) via MiniSearch.loadJSON.
  beforeEach(() => {
    cy.intercept('GET', '/_content/search-index.json').as('searchIndex')
  })

  it('renders search input', () => {
    cy.visit('/content-search')
    cy.get('[data-cy=content-search-input]').should('exist')
  })

  it('shows no results before typing 2 chars', () => {
    cy.visit('/content-search')
    cy.wait('@searchIndex')
    setSearchQuery('H')
    cy.get('[data-cy=content-search-result]').should('not.exist')
  })

  it('shows results after typing a 2-char query', () => {
    cy.visit('/content-search')
    cy.wait('@searchIndex')
    setSearchQuery('He')
    cy.get('[data-cy=content-search-result]', { timeout: 8000 }).should('have.length.at.least', 1)
  })

  it('searching "Hello" finds Hello World post', () => {
    cy.visit('/content-search')
    cy.wait('@searchIndex')
    setSearchQuery('Hello')
    cy.get('[data-cy=content-search-result]', { timeout: 8000 }).should('contain', 'Hello World')
  })

  it('searching "Getting" finds Getting Started doc', () => {
    cy.visit('/content-search')
    cy.wait('@searchIndex')
    setSearchQuery('Getting')
    cy.get('[data-cy=content-search-result]', { timeout: 8000 }).should('contain', 'Getting Started')
  })

  it('result items have data-path attribute', () => {
    cy.visit('/content-search')
    cy.wait('@searchIndex')
    setSearchQuery('Hello')
    cy.get('[data-cy=content-search-result]', { timeout: 8000 }).first().should('have.attr', 'data-path')
  })

  it('clearing query clears results', () => {
    cy.visit('/content-search')
    cy.wait('@searchIndex')
    setSearchQuery('Hello')
    cy.get('[data-cy=content-search-result]', { timeout: 8000 }).should('have.length.at.least', 1)
    setSearchQuery('')
    cy.get('[data-cy=content-search-result]').should('not.exist')
  })
})
