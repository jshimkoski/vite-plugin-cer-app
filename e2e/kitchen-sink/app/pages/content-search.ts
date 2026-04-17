/**
 * Content search page — exercises `useContentSearch()`.
 * Typing into the search box triggers MiniSearch results (debounced).
 * Route: /content-search
 */

component('page-content-search', () => {
  useHead({ title: 'Content Search — Kitchen Sink' })

  const { query, results, loading } = useContentSearch()

  return html`
    <div>
      <h1 data-cy="content-search-heading">Content Search</h1>
      <input
        type="search"
        placeholder="Search content…"
        data-cy="content-search-input"
        .value="${query.value}"
        @input="${(e: Event) => { query.value = (e.target as HTMLInputElement).value }}"
      />
      ${loading.value ? html`<p data-cy="content-search-loading">Searching…</p>` : ''}
      <ul data-cy="content-search-results">
        ${results.value.map(r => html`
          <li data-cy="content-search-result" data-path="${r._path}">
            <a href="${r._path}" data-cy="content-search-link">${r.title ?? r._path}</a>
            ${r.description ? html`<p data-cy="content-search-desc">${r.description}</p>` : ''}
          </li>
        `)}
      </ul>
      ${results.value.length === 0 && query.value.length > 0 && !loading.value ? html`
        <p data-cy="content-search-empty">No results for "${query.value}".</p>
      ` : ''}
    </div>
  `
})
