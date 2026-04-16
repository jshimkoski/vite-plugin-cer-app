import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'pathe'
import { generateAppEntryTemplate } from '../../runtime/app-template.js'

const src = readFileSync(
  resolve(import.meta.dirname, '../../runtime/app-template.ts'),
  'utf-8',
)

describe('app-template (source content)', () => {
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

describe('generateAppEntryTemplate', () => {
  it('calls enableJITCSS() with no arguments when customColors is omitted', () => {
    const out = generateAppEntryTemplate()
    expect(out).toContain('enableJITCSS()')
    expect(out).not.toContain('customColors')
  })

  it('calls enableJITCSS() with no arguments when customColors is an empty object', () => {
    const out = generateAppEntryTemplate({})
    expect(out).toContain('enableJITCSS()')
    expect(out).not.toContain('customColors')
  })

  it('serializes a single color family into the enableJITCSS call', () => {
    const out = generateAppEntryTemplate({ brand: { '500': '#7c3aed' } })
    expect(out).toContain('enableJITCSS({ customColors:')
    expect(out).toContain('"brand"')
    expect(out).toContain('"500"')
    expect(out).toContain('"#7c3aed"')
  })

  it('serializes multiple color families correctly', () => {
    const out = generateAppEntryTemplate({
      brand: { '100': '#ede9fe', '900': '#4c1d95' },
      accent: { DEFAULT: '#f59e0b' },
    })
    expect(out).toContain('"brand"')
    expect(out).toContain('"accent"')
    expect(out).toContain('"DEFAULT"')
    expect(out).toContain('"#f59e0b"')
  })

  it('serializes CSS variable references as color values', () => {
    const out = generateAppEntryTemplate({
      surface: { DEFAULT: 'var(--md-sys-color-surface)' },
    })
    expect(out).toContain('"surface"')
    expect(out).toContain('var(--md-sys-color-surface)')
  })

  it('still includes all standard template content when customColors is provided', () => {
    const out = generateAppEntryTemplate({ brand: { '500': '#ff0000' } })
    expect(out).toContain('virtual:cer-jit-css')
    expect(out).toContain('virtual:cer-routes')
    expect(out).toContain('enableJITCSS')
    expect(out).toContain('export { router }')
  })
})
