/**
 * Declarative Shadow DOM (DSD) correctness tests.
 *
 * For SSR and SSG modes, validates that the server-rendered HTML:
 * 1. Contains <template shadowrootmode="open"> elements (value must be "open")
 * 2. Each shadow template has its own embedded <style> (JIT CSS not stripped to <head>)
 * 3. Shadow DOM styles are NOT hoisted to <head> (which would break encapsulation)
 * 4. Shadow templates contain the actual rendered component content
 * 5. More complex routes produce more shadow templates than simple routes
 * 6. The loading indicator is NOT present in the initial HTML
 * 7. The DSD polyfill is present and positioned after </cer-layout-view>
 * 8. After JS hydration, custom elements have live, accessible shadow roots
 * 9. Hydration does not duplicate or destroy the pre-rendered shadow content
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

// All pre-renderable routes
const ALL_ROUTES = [
  '/',
  '/about',
  '/counter',
  '/head',
  '/blog',
  '/blog/first-post',
  '/blog/second-post',
  '/items/1',
  '/items/2',
  '/login',
]

if (mode === 'spa') {
  describe('DSD (skipped in SPA mode)', () => {
    it('SPA mode has no server-side rendering — DSD tests are SSR/SSG only', () => {
      cy.log('DSD tests are skipped in SPA mode')
    })
  })
} else {
  // ─── Structure: every route has well-formed DSD ───────────────────────────

  describe('DSD structure — all routes', () => {
    ALL_ROUTES.forEach((path) => {
      it(`${path} has valid DSD structure`, () => {
        cy.assertDSDStructure(path)
      })
    })
  })

  // ─── Content: shadow templates contain the actual rendered content ─────────

  describe('DSD content — shadow templates contain rendered output', () => {
    it('home (/): layout nav and page heading are inside shadow templates', () => {
      // layout-default renders site-nav; page-index renders the home heading
      cy.assertDSDContains('/', 'data-cy="site-nav"')
      cy.assertDSDContains('/', 'data-cy="home-heading"')
      cy.assertDSDContains('/', 'Kitchen Sink')
    })

    it('home (/): ks-badge content is inside a shadow template', () => {
      cy.assertDSDContains('/', 'data-cy="ks-badge"')
    })

    it('about (/about): page heading is inside a shadow template', () => {
      cy.assertDSDContains('/about', 'data-cy="about-heading"')
      cy.assertDSDContains('/about', 'About')
    })

    it('counter (/counter): heading and initial count 0 are inside shadow templates', () => {
      cy.assertDSDContains('/counter', 'data-cy="counter-heading"')
      cy.assertDSDContains('/counter', 'Counter')
      cy.assertDSDContains('/counter', 'data-cy="count"')
    })

    it('blog (/blog): blog heading is inside a shadow template', () => {
      cy.assertDSDContains('/blog', 'data-cy="blog-heading"')
    })

    it('blog detail (/blog/first-post): post title is inside a shadow template', () => {
      cy.assertDSDContains('/blog/first-post', 'First Post')
    })
  })

  // ─── Template depth: complex routes have more templates than simple ones ───

  describe('DSD template count — complexity reflects component tree', () => {
    it('home (/) has more shadow templates than about (/about)', () => {
      cy.request('/').then((homeResp) => {
        cy.request('/about').then((aboutResp) => {
          const homeTemplates = [
            ...homeResp.body.matchAll(/<template shadowrootmode="open"/g),
          ].length
          const aboutTemplates = [
            ...aboutResp.body.matchAll(/<template shadowrootmode="open"/g),
          ].length

          expect(
            homeTemplates,
            'home page (default layout + page-index + ks-badge) should have more templates than about',
          ).to.be.greaterThan(aboutTemplates)
        })
      })
    })

    it('each route has at least 2 shadow templates (layout + page)', () => {
      ALL_ROUTES.forEach((path) => {
        cy.request(path).then((resp) => {
          const count = [...resp.body.matchAll(/<template shadowrootmode="open"/g)].length
          expect(count, `${path}: should have at least 2 shadow templates`).to.be.at.least(2)
        })
      })
    })
  })

  // ─── DSD polyfill ─────────────────────────────────────────────────────────

  describe('DSD polyfill', () => {
    it('polyfill script is present in the home page HTML', () => {
      cy.request('/').then((resp) => {
        // The polyfill inlines a function that calls attachShadow on existing templates
        expect(resp.body, 'DSD polyfill should be present in server HTML').to.include(
          'attachShadow',
        )
      })
    })

    it('polyfill is placed after </cer-layout-view> so it runs outside shadow light DOM', () => {
      cy.request('/').then((resp) => {
        const html: string = resp.body
        const clvEnd = html.lastIndexOf('</cer-layout-view>')
        const polyfillIdx = html.indexOf('attachShadow')
        expect(clvEnd, 'cer-layout-view closing tag must exist').to.be.greaterThan(-1)
        expect(polyfillIdx, 'DSD polyfill must exist').to.be.greaterThan(-1)
        expect(polyfillIdx, 'DSD polyfill must come AFTER </cer-layout-view>').to.be.greaterThan(
          clvEnd,
        )
      })
    })
  })

  // ─── Loading indicator ────────────────────────────────────────────────────

  describe('loading indicator absent from initial HTML', () => {
    it('home page: loading indicator is not in the server-rendered HTML', () => {
      cy.request('/').then((resp) => {
        expect(resp.body).not.to.include('page-loading')
        expect(resp.body).not.to.include('data-cy="loading-indicator"')
      })
    })
  })

  // ─── Hydration: shadow roots are live after JS boots ──────────────────────

  describe('DSD hydration — shadow roots live after JS', () => {
    it('layout-default has a live shadow root after hydration on home (/)', () => {
      cy.visit('/')
      cy.get('layout-default').should('exist')
      cy.assertShadowRootLive('layout-default')
    })

    it('page-index has a live shadow root after hydration on home (/)', () => {
      cy.visit('/')
      cy.get('page-index', { includeShadowDom: true }).should('exist')
      cy.assertShadowRootLive('page-index')
    })

    it('layout-minimal has a live shadow root after hydration on about (/about)', () => {
      cy.visit('/about')
      cy.get('layout-minimal').should('exist')
      cy.assertShadowRootLive('layout-minimal')
    })

    it('page-about has a live shadow root after hydration on about (/about)', () => {
      cy.visit('/about')
      cy.assertShadowRootLive('page-about')
    })

    it('page-counter has a live shadow root after hydration on counter (/counter)', () => {
      cy.visit('/counter')
      cy.assertShadowRootLive('page-counter')
    })

    it('shadow root content survives hydration — home heading still readable', () => {
      cy.visit('/')
      // Content set by DSD pre-render should still be accessible in the live shadow root
      cy.get('[data-cy="home-heading"]').should('have.text', 'Kitchen Sink')
    })

    it('shadow root content survives hydration — site-nav still rendered', () => {
      cy.visit('/')
      cy.get('[data-cy="site-nav"]').should('exist')
      cy.get('[data-cy="nav-home"]').should('exist')
    })

    it('shadow root content survives hydration — counter shows initial count 0', () => {
      cy.visit('/counter')
      cy.get('[data-cy="count"]').should('have.text', '0')
    })
  })
}
