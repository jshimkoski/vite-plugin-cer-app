// Route middleware — redirects to /login if not authenticated.
// Set localStorage.setItem('ks-token', '1') to simulate login.
export default defineMiddleware((_to, _from) => {
  const isLoggedIn = typeof localStorage !== 'undefined'
    ? !!localStorage.getItem('ks-token')
    : false

  return isLoggedIn ? true : '/login'
})
