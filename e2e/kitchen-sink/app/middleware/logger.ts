// Wrapper middleware that uses next() to run code before and after the rest
// of the middleware chain.  Stores a breadcrumb in sessionStorage so e2e tests
// can verify that next() was called in the correct order.
export default defineMiddleware(async (_to, _from, next) => {
  if (typeof sessionStorage !== 'undefined') {
    const prev = sessionStorage.getItem('mw-log') ?? ''
    sessionStorage.setItem('mw-log', `${prev}before:`)
  }
  await next()
  if (typeof sessionStorage !== 'undefined') {
    const prev = sessionStorage.getItem('mw-log') ?? ''
    sessionStorage.setItem('mw-log', `${prev}after`)
  }
})
