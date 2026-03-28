// Simulates a third-party component library imported as a plugin side-effect.
// This component is NOT in app/components/ (auto-scanned), so it can only be
// registered by this plugin import — exactly like @jasonshimmy/cer-material or
// any other npm CER component package.
//
// In SSR/SSG the server bundle must share one CER runtime registry with this
// plugin so that renderToStreamWithJITCSSDSD can emit DSD for ks-plugin-card.
import { component, html, css, useStyle } from '@jasonshimmy/custom-elements-runtime'

component('ks-plugin-card', () => {
  useStyle(() => css`
    :host { display: block; }
    .card {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 16px;
    }
  `)
  return html`
    <div class="card" data-cy="ks-plugin-card">
      <slot></slot>
    </div>
  `
})

export default { name: 'ks-plugin-components' }
