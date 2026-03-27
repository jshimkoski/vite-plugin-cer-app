/**
 * E2E tests for middleware next() chaining.
 *
 * The kitchen-sink /middleware-chain-test page uses:
 *   middleware: ['logger', 'auth']
 *
 * 'logger' is a wrapper middleware that calls next() and records execution
 * order to sessionStorage.
 * 'auth' is a guard middleware that blocks / redirects if not logged in.
 */

describe('Middleware next() chaining', () => {
  beforeEach(() => {
    cy.clearAllSessionStorage()
  })

  context('wrapper middleware runs before and after guard', () => {
    // These tests use client-side navigation (router.push) so that the
    // beforeEnter middleware chain actually fires. A cy.visit() is a full
    // page reload and does not trigger client-side route guards.

    it('records "before:" in sessionStorage when navigating to the chained page', () => {
      cy.visit('/')
      cy.window().then((win) => {
        win.localStorage.setItem('ks-token', '1')
        win.sessionStorage.removeItem('mw-log')
        // @ts-expect-error cerRouter is a private global
        win.__cerRouter?.push('/middleware-chain-test')
      })
      cy.get('[data-cy=chain-heading]', { timeout: 5000 }).should('contain', 'Middleware Chain Test')
      cy.window().then((win) => {
        expect(win.sessionStorage.getItem('mw-log')).to.include('before:')
      })
    })

    it('records "after" in sessionStorage after navigation completes', () => {
      cy.visit('/')
      cy.window().then((win) => {
        win.localStorage.setItem('ks-token', '1')
        win.sessionStorage.removeItem('mw-log')
        // @ts-expect-error cerRouter is a private global
        win.__cerRouter?.push('/middleware-chain-test')
      })
      cy.get('[data-cy=chain-heading]', { timeout: 5000 }).should('contain', 'Middleware Chain Test')
      cy.window().then((win) => {
        expect(win.sessionStorage.getItem('mw-log')).to.include('after')
      })
    })

    it('execution order is before → (guard runs) → after', () => {
      cy.visit('/')
      cy.window().then((win) => {
        win.localStorage.setItem('ks-token', '1')
        win.sessionStorage.removeItem('mw-log')
        // @ts-expect-error cerRouter is a private global
        win.__cerRouter?.push('/middleware-chain-test')
      })
      cy.get('[data-cy=chain-heading]', { timeout: 5000 }).should('contain', 'Middleware Chain Test')
      cy.window().then((win) => {
        const log = win.sessionStorage.getItem('mw-log') ?? ''
        const beforeIdx = log.indexOf('before:')
        const afterIdx = log.indexOf('after')
        expect(beforeIdx).to.be.greaterThan(-1)
        expect(afterIdx).to.be.greaterThan(beforeIdx)
      })
    })
  })

  context('guard middleware still blocks when unauthenticated', () => {
    it('redirects to /login when not authenticated (guard inside chain)', () => {
      cy.visit('/middleware-chain-test')
      cy.url().should('include', '/login')
    })
  })

  context('page renders when all middleware passes', () => {
    beforeEach(() => {
      cy.visit('/')
      cy.window().then((win) => {
        win.localStorage.setItem('ks-token', '1')
      })
    })

    it('renders the middleware-chain-test page', () => {
      cy.visit('/middleware-chain-test')
      cy.get('[data-cy=chain-heading]').should('contain', 'Middleware Chain Test')
    })
  })
})
