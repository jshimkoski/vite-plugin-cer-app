import './commands'

// Fail tests on uncaught exceptions only if they're from the app (not network errors)
Cypress.on('uncaught:exception', (err) => {
  // Ignore fetch errors (expected in SSG mode where API routes don't exist)
  if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
    return false
  }
  return true
})
