/**
 * Server API route tests.
 *
 * Only run in SSR mode — SSG and SPA don't have live API endpoints.
 */

const mode = Cypress.env('mode') as 'spa' | 'ssr' | 'ssg'

if (mode !== 'ssr') {
  describe('Server API routes', () => {
    it('skipped — only tested in SSR mode', () => {
      cy.log(`API tests skipped in ${mode} mode`)
    })
  })
} else {
  describe('Server API routes (SSR mode)', () => {
    context('GET /api/health', () => {
      it('returns 200 with status ok', () => {
        cy.request('/api/health').then((response) => {
          expect(response.status).to.eq(200)
          expect(response.body.status).to.eq('ok')
          expect(response.body.service).to.eq('kitchen-sink')
        })
      })
    })

    context('GET /api/posts', () => {
      it('returns 200 with array of posts', () => {
        cy.request('/api/posts').then((response) => {
          expect(response.status).to.eq(200)
          expect(response.body).to.be.an('array')
          expect(response.body.length).to.be.greaterThan(0)
        })
      })

      it('first post has slug, title, excerpt, body', () => {
        cy.request('/api/posts').then((response) => {
          const post = response.body[0]
          expect(post).to.have.property('slug')
          expect(post).to.have.property('title')
          expect(post).to.have.property('excerpt')
          expect(post).to.have.property('body')
        })
      })

      it('contains first-post and second-post', () => {
        cy.request('/api/posts').then((response) => {
          const slugs = response.body.map((p: any) => p.slug)
          expect(slugs).to.include('first-post')
          expect(slugs).to.include('second-post')
        })
      })
    })

    context('GET /api/posts/:slug', () => {
      it('returns the correct post for first-post', () => {
        cy.request('/api/posts/first-post').then((response) => {
          expect(response.status).to.eq(200)
          expect(response.body.slug).to.eq('first-post')
          expect(response.body.title).to.eq('First Post')
          expect(response.body.body).to.include('First post body content')
        })
      })

      it('returns the correct post for second-post', () => {
        cy.request('/api/posts/second-post').then((response) => {
          expect(response.status).to.eq(200)
          expect(response.body.slug).to.eq('second-post')
          expect(response.body.title).to.eq('Second Post')
        })
      })

      it('returns 404 for unknown slug', () => {
        cy.request({ url: '/api/posts/not-a-post', failOnStatusCode: false }).then((response) => {
          expect(response.status).to.eq(404)
          expect(response.body).to.have.property('error')
        })
      })
    })
  })
}
