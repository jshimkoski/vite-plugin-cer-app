// Tests auto-imported composable (useKsCounter) + reactive state
component('page-counter', () => {
  const { count, increment, decrement, reset } = useKsCounter()

  return html`
    <div>
      <h1 data-cy="counter-heading">Counter</h1>
      <p>Tests auto-imported <code>useKsCounter</code> composable and reactive state.</p>
      <div data-cy="counter-widget">
        <p>Count: <strong data-cy="count">${count.value}</strong></p>
        <button data-cy="decrement" @click="${decrement}">−</button>
        <button data-cy="reset" @click="${reset}">Reset</button>
        <button data-cy="increment" @click="${increment}">+</button>
      </div>
    </div>
  `
})
