component('ks-badge', () => {
  const slots = useSlots()
  return html`
    <span data-cy="ks-badge" style="display:inline-block;background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:4px;font-size:0.85em;font-weight:600">
      ${slots.default ?? 'badge'}
    </span>
  `
})
