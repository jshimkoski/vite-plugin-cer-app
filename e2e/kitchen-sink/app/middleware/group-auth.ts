// P2-1: Group auth middleware — redirects unauthorized users.
// Adds a visible guard marker so e2e tests can detect it was applied.
export default defineMiddleware(() => {
  // Returning a string path redirects to that route.
  // In a real app this would check auth state first.
  return '/group-auth-blocked'
})
