// Tests that page loader return values are passed as element attributes so
// useProps() can read them alongside URL params.
component('page-loader-props-test', () => {
  const props = useProps<{ label: string; count: string }>({ label: '', count: '0' })

  return html`
    <div>
      <h1 data-cy="loader-props-heading">Loader Props Test</h1>
      <p data-cy="loader-label">Label: <strong>${props.label}</strong></p>
      <p data-cy="loader-count">Count: <strong>${props.count}</strong></p>
    </div>
  `
})

export const loader = async () => {
  return { label: 'Hello from loader', count: '42' }
}

export const meta = { layout: 'minimal' }
