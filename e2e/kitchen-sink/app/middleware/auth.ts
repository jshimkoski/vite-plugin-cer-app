// Route middleware — redirects to /login if not authenticated.
// Set localStorage.setItem('ks-token', '1') to simulate login.
export default (to: any, _from: any, next: (path?: string) => void) => {
  const isLoggedIn = typeof localStorage !== 'undefined'
    ? !!localStorage.getItem('ks-token')
    : false

  if (!isLoggedIn) {
    next('/login')
  } else {
    next()
  }
}
