import { describe, expect, it } from 'vitest'
import { component, html, useProps, unsafeHTML } from '@jasonshimmy/custom-elements-runtime'
import { renderToStringDSD } from '@jasonshimmy/custom-elements-runtime/ssr'
import { renderContent } from '../../runtime/composables/render-content.js'

component('test-content-island', () => {
  const props = useProps({ items: [] as string[] })
  return html`<ul>${props.items.map((item) => html`<li>${item}</li>`)}</ul>`
}, { hydrate: 'load' })
describe('explicit content rendering', () => {
  it('renders registered components with loader props through DSD', () => {
    const content = renderContent({ body: '<h1>Guide</h1><test-content-island></test-content-island>' }, { components: { 'test-content-island': { items: ['Server content'] } } })
    const output = renderToStringDSD({ tag: 'article', children: Array.isArray(content) ? content : [content] }, { _inheritedHydrateStrategy: 'none', dsdPolyfill: false })
    expect(output).toContain('shadowrootmode="open"')
    expect(output).toContain('<li>Server content</li>')
    expect(output).toContain('data-cer-props=')
  })
  it('preserves literal unsafeHTML behavior', () => {
    const output = renderToStringDSD(html`<article>${unsafeHTML('<test-content-island></test-content-island>')}</article>` as any)
    expect(output).not.toContain('<template shadowrootmode')
  })
})
