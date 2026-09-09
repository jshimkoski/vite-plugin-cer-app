import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    specPattern: 'e2e/cypress/e2e/**/*.cy.ts',
    supportFile: 'e2e/cypress/support/e2e.ts',
    screenshotsFolder: 'e2e/cypress/screenshots',
    videosFolder: 'e2e/cypress/videos',
    // Pierce shadow DOM globally so all cy.get() calls work across shadow roots
    includeShadowDom: true,
    viewportWidth: 1280,
    viewportHeight: 720,
    // Give the server time to start
    pageLoadTimeout: 15000,
    // Mode is public test configuration passed through --expose. Keeping the
    // deprecated browser-readable Cypress.env() API disabled prevents tests
    // from accidentally exposing secrets and future-proofs Cypress 16.
    allowCypressEnv: false,
  },
})
