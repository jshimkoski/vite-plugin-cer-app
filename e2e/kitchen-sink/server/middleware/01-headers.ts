// Server middleware — adds a custom header to every response so e2e tests
// can verify that the server middleware chain ran correctly.
export default defineServerMiddleware((_req, res, next) => {
  res.setHeader('X-CER-Middleware', 'active')
  next()
})
