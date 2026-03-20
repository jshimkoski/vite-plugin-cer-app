/**
 * Routes test — verifies every route renders correct content in all build modes.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

describe('Route rendering', () => {
  context('Home page (/)', () => {
    it('renders the home heading', () => {
      cy.visit('/')
      cy.get('[data-cy=home-heading]').should('contain', 'Kitchen Sink')
    })

    it('renders the ks-badge component', () => {
      cy.visit('/')
      cy.get('[data-cy=ks-badge]').should('exist')
    })

    it('renders the default layout with nav', () => {
      cy.visit('/')
      cy.get('[data-cy=site-nav]').should('exist')
      cy.get('[data-cy=site-header]').should('exist')
      cy.get('[data-cy=site-footer]').should('exist')
    })

    it('renders all nav links', () => {
      cy.visit('/')
      cy.get('[data-cy=nav-home]').should('exist')
      cy.get('[data-cy=nav-about]').should('exist')
      cy.get('[data-cy=nav-counter]').should('exist')
      cy.get('[data-cy=nav-blog]').should('exist')
    })
  })

  context('About page (/about) — minimal layout + useHead', () => {
    it('renders the about heading', () => {
      cy.visit('/about')
      cy.get('[data-cy=about-heading]').should('contain', 'About')
    })

    it('uses the minimal layout (no site-nav)', () => {
      cy.visit('/about')
      cy.get('[data-cy=minimal-layout]').should('exist')
      cy.get('[data-cy=site-nav]').should('not.exist')
    })
  })

  context('Counter page (/counter)', () => {
    it('renders the counter heading', () => {
      cy.visit('/counter')
      cy.get('[data-cy=counter-heading]').should('contain', 'Counter')
    })

    it('renders the counter widget with initial count of 0', () => {
      cy.visit('/counter')
      cy.get('[data-cy=count]').should('contain', '0')
    })

    it('renders increment, decrement, and reset buttons', () => {
      cy.visit('/counter')
      cy.get('[data-cy=increment]').should('exist')
      cy.get('[data-cy=decrement]').should('exist')
      cy.get('[data-cy=reset]').should('exist')
    })
  })

  context('Head page (/head) — useHead', () => {
    it('renders the head-test heading', () => {
      cy.visit('/head')
      cy.get('[data-cy=head-heading]').should('contain', 'Head Test')
    })
  })

  context('Blog list page (/blog)', () => {
    it('renders the blog heading', () => {
      cy.visit('/blog')
      cy.get('[data-cy=blog-heading]').should('contain', 'Blog')
    })
  })

  context('Blog detail page (/blog/first-post) — dynamic route', () => {
    it('renders the post title', () => {
      cy.visit('/blog/first-post')
      cy.get('[data-cy=post-title]').should('contain', 'First Post')
    })

    it('renders the post slug', () => {
      cy.visit('/blog/first-post')
      cy.get('[data-cy=post-slug]').should('contain', 'first-post')
    })
  })

  context('Item page (/items/1) — route params via useProps', () => {
    it('renders the item heading', () => {
      cy.visit('/items/1')
      cy.get('[data-cy=item-heading]').should('contain', 'Item Detail')
    })

    it('shows the correct item ID from route params', () => {
      cy.visit('/items/1')
      cy.get('[data-cy=item-id]').should('contain', '1')
    })

    it('shows a different ID for /items/2', () => {
      cy.visit('/items/2')
      cy.get('[data-cy=item-id]').should('contain', '2')
    })
  })

  context('Login page (/login) — route group, minimal layout', () => {
    it('renders the login heading', () => {
      cy.visit('/login')
      cy.get('[data-cy=login-heading]').should('contain', 'Login')
    })

    it('uses the minimal layout', () => {
      cy.visit('/login')
      cy.get('[data-cy=minimal-layout]').should('exist')
    })
  })

  context('404 page — catch-all route', () => {
    it('renders the 404 heading for an unknown path', () => {
      cy.visit('/this-page-does-not-exist-at-all', { failOnStatusCode: false })
      cy.get('[data-cy=not-found-heading]').should('contain', '404')
    })
  })
})
