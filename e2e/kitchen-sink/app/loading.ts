component('page-loading', () => {
  return html`
    <div data-cy="loading-indicator" style="display:flex;align-items:center;gap:8px;padding:1rem;font-family:sans-serif;color:#888">
      <span style="display:inline-block;width:14px;height:14px;border:2px solid #ccc;border-top-color:#555;border-radius:50%;animation:spin 0.7s linear infinite"></span>
      Loading…
      <style>@keyframes spin { to { transform: rotate(360deg) } }</style>
    </div>
  `
})
