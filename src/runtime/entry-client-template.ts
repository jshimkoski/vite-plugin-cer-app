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

import './app.js'
`
