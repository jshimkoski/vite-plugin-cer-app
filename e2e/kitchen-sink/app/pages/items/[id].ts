component('page-items-id', () => {
  const props = useProps<{ id: string }>({ id: '' })

  return html`
    <div>
      <h1 data-cy="item-heading">Item Detail</h1>
      <p data-cy="item-id-display">Item ID: <strong data-cy="item-id">${props.id}</strong></p>
      <p><a href="/" data-cy="item-back">← Home</a></p>
    </div>
  `
})

export const meta = {
  ssg: {
    paths: async () => [
      { params: { id: '1' } },
      { params: { id: '2' } },
    ],
  },
}
