// Tests useState() — globally-keyed reactive state shared between layout and page.
// The loader sets pageTitle before rendering so the layout sees it on SSR.
// The page also exposes a button to change the title client-side to verify
// that the layout re-renders reactively when useState is mutated.

export const loader = async () => {
  useState<string>('pageTitle').value = 'useState Page Title'
  return {}
}

component('page-use-state-test', () => {
  const pageTitle = useState<string>('pageTitle')

  function changeTitle() {
    pageTitle.value = 'Title Updated!'
  }

  function resetTitle() {
    pageTitle.value = 'useState Page Title'
  }

  return html`
    <div>
      <h1 data-cy="use-state-heading">${pageTitle.value}</h1>
      <p data-cy="use-state-description">
        Tests <code>useState()</code> — globally-keyed reactive state shared
        between this page and the layout.
      </p>
      <p>
        Current title:
        <strong data-cy="page-title-display">${pageTitle.value}</strong>
      </p>
      <button data-cy="change-title" @click="${changeTitle}">Change Title</button>
      <button data-cy="reset-title" @click="${resetTitle}">Reset Title</button>
    </div>
  `
})
