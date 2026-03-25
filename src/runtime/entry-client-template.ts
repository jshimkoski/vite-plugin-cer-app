/**
 * Template string for `entry-client.ts`.
 *
 * This is the browser-side entry point for SSR/SSG modes.
 * It hydrates the server-rendered HTML and activates client-side routing.
 */
export const ENTRY_CLIENT_TEMPLATE = `// Client-side entry — hydrates SSR output

// Capture SSR loader data before any scripts clear it.
// usePageData() reads from this global; it is cleared after the first read
// so subsequent client-side navigations don't reuse stale data.
if (typeof window !== 'undefined' && window.__CER_DATA__) {
  (globalThis).__CER_DATA__ = window.__CER_DATA__
}

// Capture useFetch() data pre-fetched on the server.
// Keys are consumed on first read; subsequent navigations fetch fresh.
if (typeof window !== 'undefined' && window.__CER_FETCH_DATA__) {
  (globalThis).__CER_FETCH_DATA__ = window.__CER_FETCH_DATA__
}

// Capture the authenticated user injected by the SSR handler.
// useAuth() reads this on the client instead of re-reading the cookie.
if (typeof window !== 'undefined' && window.__CER_AUTH_USER__) {
  (globalThis).__CER_AUTH_USER__ = window.__CER_AUTH_USER__
}

import './app.js'
`
