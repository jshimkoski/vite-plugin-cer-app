import { describe, it, expect } from 'vitest'
import { ENTRY_CLIENT_TEMPLATE } from '../../runtime/entry-client-template.js'

describe('ENTRY_CLIENT_TEMPLATE', () => {
  it('is exported as a string', () => {
    expect(typeof ENTRY_CLIENT_TEMPLATE).toBe('string')
    expect(ENTRY_CLIENT_TEMPLATE.length).toBeGreaterThan(0)
  })

  it('captures __CER_DATA__ from window to globalThis before app boots', () => {
    // SSR loader data must be captured before any module clears window.__CER_DATA__
    expect(ENTRY_CLIENT_TEMPLATE).toContain('window.__CER_DATA__')
    expect(ENTRY_CLIENT_TEMPLATE).toContain('(globalThis).__CER_DATA__')
  })

  it('captures __CER_FETCH_DATA__ from window to globalThis before app boots', () => {
    // useFetch() hydration data injected by the server must be captured early
    expect(ENTRY_CLIENT_TEMPLATE).toContain('window.__CER_FETCH_DATA__')
    expect(ENTRY_CLIENT_TEMPLATE).toContain('(globalThis).__CER_FETCH_DATA__')
  })

  it('captures __CER_AUTH_USER__ from window to globalThis before app boots', () => {
    // useAuth() reads the authenticated user from globalThis on the client
    expect(ENTRY_CLIENT_TEMPLATE).toContain('window.__CER_AUTH_USER__')
    expect(ENTRY_CLIENT_TEMPLATE).toContain('(globalThis).__CER_AUTH_USER__')
  })

  it('imports app.js as the framework entry point', () => {
    expect(ENTRY_CLIENT_TEMPLATE).toContain("import './app.js'")
  })

  it('guards each capture with a typeof window check', () => {
    // Guards are required so the template works in SSR environments where
    // window is not defined.
    const windowChecks = (ENTRY_CLIENT_TEMPLATE.match(/typeof window !== 'undefined'/g) ?? []).length
    expect(windowChecks).toBeGreaterThanOrEqual(3)
  })

  it('captures globals before importing app.js', () => {
    // The capture blocks must appear BEFORE the app import so that
    // usePageData() / useFetch() / useAuth() can read them synchronously
    // during module evaluation.
    const appImportIdx = ENTRY_CLIENT_TEMPLATE.indexOf("import './app.js'")
    const cerDataIdx = ENTRY_CLIENT_TEMPLATE.indexOf('window.__CER_DATA__')
    const fetchDataIdx = ENTRY_CLIENT_TEMPLATE.indexOf('window.__CER_FETCH_DATA__')
    const authUserIdx = ENTRY_CLIENT_TEMPLATE.indexOf('window.__CER_AUTH_USER__')

    expect(cerDataIdx).toBeGreaterThanOrEqual(0)
    expect(fetchDataIdx).toBeGreaterThanOrEqual(0)
    expect(authUserIdx).toBeGreaterThanOrEqual(0)
    expect(cerDataIdx).toBeLessThan(appImportIdx)
    expect(fetchDataIdx).toBeLessThan(appImportIdx)
    expect(authUserIdx).toBeLessThan(appImportIdx)
  })
})
