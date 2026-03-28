// P1-2: Server middleware that throws a custom status code.
// Only triggers for requests to /middleware-status-test.
export default defineServerMiddleware((req, _res, next) => {
  if (req.url === '/middleware-status-test') {
    const err = new Error('Unauthorized') as Error & { status: number }
    err.status = 401
    throw err
  }
  next()
})
