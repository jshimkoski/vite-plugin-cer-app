import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'pathe'

const src = readFileSync(
  resolve(import.meta.dirname, '../../runtime/app-template.ts'),
  'utf-8',
)

describe('app-template (APP_ENTRY_TEMPLATE content)', () => {
  it('does not import virtual:cer-components (components injected per-file by cerComponentImports)', () => {
    expect(src).not.toContain('virtual:cer-components')
  })

  it('imports virtual:cer-routes', () => {
    expect(src).toContain('virtual:cer-routes')
  })

  it('imports virtual:cer-layouts', () => {
    expect(src).toContain('virtual:cer-layouts')
  })

  it('imports virtual:cer-plugins', () => {
    expect(src).toContain('virtual:cer-plugins')
  })

  it('imports registerBuiltinComponents from custom-elements-runtime', () => {
    expect(src).toContain('registerBuiltinComponents')
    expect(src).toContain('setDevMode')
    expect(src).toContain('@jasonshimmy/custom-elements-runtime')
  })

  it('enables runtime dev logging from the downstream Vite env', () => {
    expect(src).toContain('const _cerRuntimeDev')
    expect(src).toContain('import.meta.env?.DEV')
    expect(src).toContain('_cerProcess?.env')
    expect(src).toContain('(globalThis).__CE_RUNTIME_DEV__ = _cerRuntimeDev')
    expect(src).toContain('setDevMode(_cerRuntimeDev)')
  })

  it('imports initRouter from the router subpath', () => {
    expect(src).toContain('initRouter')
    expect(src).toContain('custom-elements-runtime/router')
  })

  it('imports enableJITCSS from the jit-css subpath', () => {
    expect(src).toContain('enableJITCSS')
    expect(src).toContain('custom-elements-runtime/jit-css')
  })

  it('imports virtual:cer-jit-css', () => {
    expect(src).toContain('virtual:cer-jit-css')
  })

  it('imports virtual:cer-content-components for markdown-backed custom elements', () => {
    expect(src).toContain('virtual:cer-content-components')
  })

  it('exports router', () => {
    expect(src).toContain('export { router }')
  })
})
