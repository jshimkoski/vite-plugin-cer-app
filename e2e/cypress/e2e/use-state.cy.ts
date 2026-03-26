/**
 * useState() e2e tests — verifies globally-keyed reactive state works correctly
 * in all rendering modes (SPA, SSR, SSG).
 *
 * Scenarios covered:
 * - Layout shows the default useState title on pages that don't set it
 * - Layout reacts to pageTitle set by the use-state-test page (client-side)
 * - Mutating useState in the page re-renders the layout reactively
 * - Navigating away from the page resets to the default title
 * - SSR: initial HTML already contains the title set by the loader
 * - SSR: window.__CER_STATE_INIT__ is injected and parsed by the browser
 * - SSR: __CER_STATE_INIT__ JSON structure contains the correct key/value
 *
 * False-positive prevention:
 * The kitchen-sink page uses 'useState Page Title' as its reactive title value.
 * This string does NOT appear anywhere hardcoded in the page template — all
 * occurrences are driven through ${pageTitle.value}. The 'Title Updated!' value
 * used by changeTitle() is similarly unique. This means any assertion on these
 * strings can only pass if the useState mechanism is actually working.
 */

export {}

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

// Helper: find inside the layout-default shadow DOM (post-hydration).
const layout = () => cy.get('cer-layout-view').shadow().find('layout-default').shadow()
// Helper: find inside the page-use-state-test shadow DOM (post-hydration).
const statePage = () => cy.get('cer-layout-view').shadow().find('page-use-state-test').shadow()

describe('useState() — default title in layout', () => {
  it('shows the default "Kitchen Sink" title on the home page', () => {
    cy.visit('/')
    cy.get('[data-cy=layout-page-title]').first().should('contain', 'Kitchen Sink')
  })
})

describe('useState() — page sets layout title', () => {
  beforeEach(() => {
    cy.visit('/use-state-test')
    statePage().find('[data-cy=use-state-heading]').should('exist')
  })

  it('layout shows the title set by the use-state-test page', () => {
    layout().find('[data-cy=layout-page-title]').should('contain', 'useState Page Title')
  })

  it('page heading is driven by the pageTitle ref', () => {
    statePage().find('[data-cy=use-state-heading]').should('contain', 'useState Page Title')
  })

  it('page-title-display shows the pageTitle ref value', () => {
    statePage().find('[data-cy=page-title-display]').should('contain', 'useState Page Title')
  })

  it('clicking "Change Title" updates the layout title reactively', () => {
    statePage().find('[data-cy=change-title]').click({ force: true })
    layout().find('[data-cy=layout-page-title]').should('contain', 'Title Updated!')
  })

  it('clicking "Change Title" also updates the page heading and in-page display', () => {
    statePage().find('[data-cy=change-title]').click({ force: true })
    statePage().find('[data-cy=use-state-heading]').should('contain', 'Title Updated!')
    statePage().find('[data-cy=page-title-display]').should('contain', 'Title Updated!')
  })

  it('clicking "Reset Title" restores the title in layout and page', () => {
    statePage().find('[data-cy=change-title]').click({ force: true })
    layout().find('[data-cy=layout-page-title]').should('contain', 'Title Updated!')
    statePage().find('[data-cy=reset-title]').click({ force: true })
    layout().find('[data-cy=layout-page-title]').should('contain', 'useState Page Title')
    statePage().find('[data-cy=page-title-display]').should('contain', 'useState Page Title')
  })
})

describe('useState() — title resets to default when navigating away', () => {
  it('layout shows default title after navigating from use-state-test to home', () => {
    cy.visit('/use-state-test')
    statePage().find('[data-cy=use-state-heading]').should('exist')
    layout().find('[data-cy=layout-page-title]').should('contain', 'useState Page Title')

    // Navigate to a page that does not set pageTitle
    cy.get('[data-cy=nav-home]').first().click({ force: true })
    cy.url().should('eq', Cypress.config('baseUrl') + '/')

    // The layout default kicks in for the home page
    layout().find('[data-cy=layout-page-title]').should('contain', 'Kitchen Sink')
  })
})

// SSR/SSG only: verify the initial server-rendered HTML already contains
// the page title set by the loader — no JS required.
// 'useState Page Title' only appears in the rendered output via useState;
// it is not hardcoded anywhere in the template, so this check cannot pass
// unless the loader correctly wrote to useState before the layout rendered.
if (mode !== 'spa') {
  describe('useState() — SSR: loader sets title before rendering', () => {
    it('initial HTML from the server already contains the loader-set title', () => {
      cy.request('/use-state-test').then((resp) => {
        expect(resp.body).to.include('useState Page Title')
      })
    })

    it('server injects __CER_STATE_INIT__ script with the loader-set state', () => {
      cy.request('/use-state-test').then((resp) => {
        expect(resp.body).to.include('__CER_STATE_INIT__')
        expect(resp.body).to.include('useState Page Title')
      })
    })

    it('__CER_STATE_INIT__ JSON contains the pageTitle key with the correct value', () => {
      cy.request('/use-state-test').then((resp) => {
        // Extract the __CER_STATE_INIT__ assignment from the HTML
        const match = resp.body.match(/window\.__CER_STATE_INIT__\s*=\s*(\{[^<]+\})/)
        expect(match, '__CER_STATE_INIT__ assignment found in HTML').to.not.be.null
        const stateInit = JSON.parse(match![1])
        expect(stateInit).to.have.property('pageTitle', 'useState Page Title')
      })
    })

    it('window.__CER_STATE_INIT__ is present on the browser window after page load', () => {
      cy.visit('/use-state-test')
      statePage().find('[data-cy=use-state-heading]').should('exist')
      cy.window().should('have.property', '__CER_STATE_INIT__')
      cy.window().its('__CER_STATE_INIT__').should('have.property', 'pageTitle', 'useState Page Title')
    })

    it('layout title is visible in the SSR-rendered light DOM before JS hydrates', () => {
      cy.visit('/use-state-test', {
        onBeforeLoad(win) {
          // Disable custom elements upgrade so we can inspect the pre-rendered light DOM
          ;(win as Window & { __CER_HYDRATE_DISABLED__?: boolean }).__CER_HYDRATE_DISABLED__ = true
        },
      })
      cy.get('[data-cy=layout-page-title]').should('contain', 'useState Page Title')
    })
  })
}
