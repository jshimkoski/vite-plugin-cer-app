// Tests that jitCss.customColors registered in cer.config.ts are available
// as utility classes inside shadow DOM components.
component('page-jit-css-custom-colors-test', () => {
  return html`
    <div>
      <h1 data-cy="heading">Custom Colors</h1>
      <div data-cy="brand-bg" class="bg-brand-500 p-4">Brand background</div>
      <p data-cy="brand-text" class="text-brand-500">Brand text</p>
      <div data-cy="brand-light-bg" class="bg-brand-100 p-4">Brand light background</div>
    </div>
  `
})

export const meta = { layout: 'minimal' }
