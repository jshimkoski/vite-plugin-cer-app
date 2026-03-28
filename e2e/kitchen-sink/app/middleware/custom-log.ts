// P2-1: A no-op middleware used to verify page-level override of group middleware.
export default defineMiddleware((_to, _from, next) => {
  next()
})
