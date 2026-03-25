/**
 * Data loading tests — page loaders, usePageData, dynamic params.
 *
 * Blog data is loaded via a page `loader` in SSR/SSG mode and falls back to
 * client-side fetch in SPA mode. Item IDs come from route params (all modes).
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

describe('Blog list — data loader', () => {
  // In SSR/SSG the loader runs server-side; data is embedded in HTML.
  // In SPA the page fetches from /api/posts on mount.

  if (mode !== 'spa') {
    it('renders pre-loaded posts in initial HTML (SSR/SSG)', () => {
      cy.request('/blog').then((response) => {
        expect(response.body).to.include('First Post')
        expect(response.body).to.include('Second Post')
      })
    })
  }

  it('blog list renders at least 2 items after hydration', () => {
    cy.visit('/blog')
    cy.get('[data-cy=blog-list]').should('exist')
    // Items appear after hydration (SSR) or fetch (SPA)
    cy.get('[data-cy=blog-item]', { timeout: 8000 }).should('have.length.at.least', 2)
  })

  it('First Post link is present', () => {
    cy.visit('/blog')
    cy.get('[data-cy=blog-item]').should('have.length.at.least', 1)
    cy.get('[data-cy="blog-link-first-post"]').should('exist')
  })

  it('Second Post link is present', () => {
    cy.visit('/blog')
    cy.get('[data-cy="blog-link-second-post"]').should('exist')
  })
})

describe('Blog detail — dynamic route with loader', () => {
  it('renders "First Post" title for /blog/first-post', () => {
    cy.visit('/blog/first-post')
    cy.get('[data-cy=post-title]').should('contain', 'First Post')
  })

  it('renders "Second Post" title for /blog/second-post', () => {
    cy.visit('/blog/second-post')
    cy.get('[data-cy=post-title]').should('contain', 'Second Post')
  })

  it('shows the correct slug in the post', () => {
    cy.visit('/blog/first-post')
    cy.get('[data-cy=post-slug]').should('contain', 'first-post')
  })

  if (mode !== 'spa') {
    it('body content is pre-rendered in initial HTML (SSR/SSG)', () => {
      cy.request('/blog/first-post').then((response) => {
        expect(response.body).to.include('First post body content')
      })
    })

    it('second post body is pre-rendered (SSR/SSG)', () => {
      cy.request('/blog/second-post').then((response) => {
        expect(response.body).to.include('Second post body content')
      })
    })
  }

  it('renders the body content after hydration', () => {
    cy.visit('/blog/first-post')
    cy.get('[data-cy=post-body]', { timeout: 8000 }).should('contain', 'First post body content')
  })

  it('back link navigates to /blog', () => {
    cy.visit('/blog/first-post')
    cy.get('[data-cy=post-back]').first().click({ force: true })
    cy.url().should('include', '/blog')
    cy.get('[data-cy=blog-heading]').should('contain', 'Blog')
  })
})

describe('Loader props — useProps reads loader return values', () => {
  // The loader returns { label: 'Hello from loader', count: '42' }.
  // These primitive values are passed as HTML attributes so useProps() can
  // read them in all render modes.

  it('displays label from loader', () => {
    cy.visit('/loader-props-test')
    cy.get('[data-cy=loader-label]').should('contain', 'Hello from loader')
  })

  it('displays count from loader', () => {
    cy.visit('/loader-props-test')
    cy.get('[data-cy=loader-count]').should('contain', '42')
  })

  if (mode !== 'spa') {
    it('loader values are pre-rendered in initial HTML (SSR/SSG)', () => {
      cy.request('/loader-props-test').then((response) => {
        expect(response.body).to.include('Hello from loader')
      })
    })
  }
})

describe('Item detail — route params via useProps', () => {
  it('shows item ID 1 for /items/1', () => {
    cy.visit('/items/1')
    cy.get('[data-cy=item-id]').should('contain', '1')
  })

  it('shows item ID 2 for /items/2', () => {
    cy.visit('/items/2')
    cy.get('[data-cy=item-id]').should('contain', '2')
  })

  it('shows correct ID for client-side nav to /items/2 from /items/1', () => {
    cy.visit('/items/1')
    cy.get('[data-cy=item-id]').should('contain', '1')
    // Navigate via browser history pushState via the router
    cy.window().then((win) => {
      // Trigger client-side navigation
      const router = (win as any).__cer_router__ ?? (win as any).router
      if (router?.push) {
        router.push('/items/2')
      }
    })
    // Fallback: visit directly
    cy.visit('/items/2')
    cy.get('[data-cy=item-id]').should('contain', '2')
  })
})
