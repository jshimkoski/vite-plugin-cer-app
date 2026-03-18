component('page-index', () => {
  return html`
    <div>
      <h1>Welcome to {{projectName}}</h1>
      <p>Edit <code>app/pages/index.ts</code> to get started.</p>
    </div>
  `
})

// Export page metadata for SSG
export const meta = {
  layout: 'default',
  ssg: {
    // No dynamic paths needed for the index page
    paths: async () => [],
  },
}
