/**
 * Custom Cypress commands for the kitchen sink e2e suite.
 */

/**
 * Assert that the raw HTML for a route has proper DSD structure:
 * - Contains <template shadowrootmode> elements
 * - Each template has embedded <style> (not stripped to <head>)
 * - No loading indicator in the pre-rendered HTML
 * - Content is present (not empty cer-layout-view)
 */
Cypress.Commands.add('assertNoDSD_FOUC', (path: string) => {
  cy.request(path).then((response) => {
    const html: string = response.body

    // Must have DSD templates
    expect(html, `${path}: should contain DSD templates`).to.include('<template shadowrootmode')

    // Each shadow template must have its own <style> block (not hoisted to <head>)
    const templateMatches = [...html.matchAll(/<template shadowrootmode[^>]*>([\s\S]*?)<\/template>/g)]
    expect(templateMatches.length, `${path}: should have at least 1 shadow template`).to.be.greaterThan(0)
    templateMatches.forEach(([, content], i) => {
      expect(content, `${path}: template[${i}] should contain <style>`).to.include('<style')
    })

    // The <head> must NOT contain raw unnamed <style> blocks (only id'd global ones are OK)
    const headMatch = html.match(/<head>([\s\S]*?)<\/head>/)
    if (headMatch) {
      const headContent = headMatch[1]
      // Allow <style id=...> (global JIT/SSR styles), reject bare <style> without id
      const bareStyles = headContent.match(/<style(?!\s+id)[^>]*>/g) ?? []
      expect(bareStyles.length, `${path}: <head> must not contain un-named <style> blocks`).to.equal(0)
    }

    // Loading indicator must NOT appear in the initial server-rendered HTML
    expect(html, `${path}: loading indicator must not be in initial HTML`).not.to.include('data-cy="loading-indicator"')

    // cer-layout-view must not be empty (pre-rendered content present)
    const layoutViewMatch = html.match(/<cer-layout-view>([\s\S]*?)<\/cer-layout-view>/)
    if (layoutViewMatch) {
      expect(layoutViewMatch[1].trim(), `${path}: cer-layout-view must have pre-rendered content`).not.to.be.empty
    }
  })
})

/**
 * Wait for a shadow DOM element to appear (handles lazy rendering).
 */
Cypress.Commands.add('getShadow', (selector: string) => {
  return cy.get(selector, { includeShadowDom: true })
})

declare global {
  namespace Cypress {
    interface Chainable {
      assertNoDSD_FOUC(path: string): Chainable<void>
      getShadow(selector: string): Chainable<JQuery<HTMLElement>>
    }
  }
}
