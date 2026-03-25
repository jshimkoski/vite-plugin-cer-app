1. Auth and useFetch were just implemented. The validate script fails and the new features are not fully tested (unit/e2e) or documented.

2. Additional issues to fix:

- Page loaders do not work. Should be thoroughly tested for dev, ssr, ssg, and spa.

  For example:

  ```ts
  component('page-inbox', () => {
    const props = useProps({ id: '' })

    return html`
      <div>
        <h1 class="text-2xl">Inbox - ${props.id}</h1>
        <p>Edit <code>app/pages/inbox.ts</code> to get started.</p>
      </div>
    `
  })

  export const loader = () => {
    return { id: 'inbox' }
  }
  ```

  The h1 element should display "Inbox - inbox" when the loader returns `{ id: 'inbox' }`, but it does not work.

- Must be able to access the current route from layout, page, components, etc. Perhaps a new useRoute() composable is needed.
- Must be able to navigate to a route without usuing router-link. Something like Nuxt's navigateTo().
- Must be able to pass page data to layouts.
- Must be able to export page meta data that can be accessed from anywhere.
- Must be able to use composables server-side and client-side.
- Every export from @jasonshimmy/custom-elements-runtime and its submodules should be available without having to manually import them.
- Composables should not have to manually import @jasonshimmy/custom-elements-runtime imports.