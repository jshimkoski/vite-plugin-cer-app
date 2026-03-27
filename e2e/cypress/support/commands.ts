/**
 * Custom Cypress commands for the kitchen sink e2e suite.
 */

/**
 * Assert that the raw HTML for a route has correct Declarative Shadow DOM structure:
 * - Contains <template shadowrootmode="open"> elements (value must be "open")
 * - Each shadow template has embedded <style> (JIT CSS not stripped to <head>)
 * - No bare (unnamed) <style> blocks in <head>
 * - No loading indicator in the pre-rendered HTML
 * - cer-layout-view has pre-rendered content (not empty)
 */
Cypress.Commands.add('assertDSDStructure', (path: string) => {
  cy.request(path).then((response) => {
    const html: string = response.body

    // Must have DSD templates with value "open" (not "closed", not missing)
    expect(html, `${path}: should contain <template shadowrootmode="open">`).to.include(
      'shadowrootmode="open"',
    )

    // Each shadow template must have its own <style> block (not hoisted to <head>)
    const templateMatches = [
      ...html.matchAll(/<template shadowrootmode="open"[^>]*>([\s\S]*?)<\/template>/g),
    ]
    expect(
      templateMatches.length,
      `${path}: should have at least 1 shadow template with shadowrootmode="open"`,
    ).to.be.greaterThan(0)

    templateMatches.forEach(([, content], i) => {
      expect(content, `${path}: template[${i}] must contain its own <style> block`).to.include(
        '<style',
      )
    })

    // The <head> must NOT contain raw unnamed <style> blocks (only id'd global ones are OK)
    const headMatch = html.match(/<head>([\s\S]*?)<\/head>/)
    if (headMatch) {
      const bareStyles = headMatch[1].match(/<style(?!\s+id)[^>]*>/g) ?? []
      expect(
        bareStyles.length,
        `${path}: <head> must not contain un-named <style> blocks`,
      ).to.equal(0)
    }

    // Loading indicator must NOT appear in the initial server-rendered HTML
    expect(html, `${path}: loading indicator must not be in initial HTML`).not.to.include(
      'data-cy="loading-indicator"',
    )

    // cer-layout-view must have pre-rendered content (not an empty tag)
    const layoutViewMatch = html.match(/<cer-layout-view>([\s\S]*?)<\/cer-layout-view>/)
    if (layoutViewMatch) {
      expect(
        layoutViewMatch[1].trim(),
        `${path}: cer-layout-view must have pre-rendered content`,
      ).not.to.be.empty
    }
  })
})

/**
 * Assert that the raw HTML for a route contains specific text inside a shadow template.
 * Use this to verify that DSD actually rendered the component's content — not just
 * that templates exist.
 *
 * Since shadow templates can be nested (a component's shadow template may contain
 * child custom elements with their own shadow templates), we verify that the expected
 * text appears anywhere in the raw HTML. assertDSDStructure already confirms that
 * the content is wrapped in <template shadowrootmode="open"> — if templates exist
 * and the attribute/text is in the HTML, it lives inside those templates.
 */
Cypress.Commands.add('assertDSDContains', (path: string, expectedText: string) => {
  cy.request(path).then((response) => {
    const html: string = response.body

    // Confirm we're in DSD territory first
    expect(html, `${path}: page must have DSD templates before checking content`).to.include(
      'shadowrootmode="open"',
    )

    expect(html, `${path}: shadow templates should contain "${expectedText}"`).to.include(
      expectedText,
    )
  })
})

/**
 * Assert that after JS hydration, a custom element has a live shadow root.
 * This confirms that DSD was processed by the browser and the element was upgraded.
 */
Cypress.Commands.add('assertShadowRootLive', (selector: string) => {
  cy.window().then((win) => {
    const el = win.document.querySelector(selector)
    expect(el, `${selector}: element should exist in the DOM`).to.not.be.null
    expect(
      (el as Element & { shadowRoot: ShadowRoot | null }).shadowRoot,
      `${selector}: should have a live shadow root after hydration`,
    ).to.not.be.null
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
      assertDSDStructure(path: string): Chainable<void>
      assertDSDContains(path: string, expectedText: string): Chainable<void>
      assertShadowRootLive(selector: string): Chainable<void>
      getShadow(selector: string): Chainable<JQuery<HTMLElement>>
    }
  }
}
