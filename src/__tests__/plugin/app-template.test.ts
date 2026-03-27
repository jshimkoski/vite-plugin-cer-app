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
    expect(src).toContain('@jasonshimmy/custom-elements-runtime')
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

  it('exports router', () => {
    expect(src).toContain('export { router }')
  })
})
