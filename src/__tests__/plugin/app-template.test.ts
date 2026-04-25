import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'pathe'
import { generateAppEntryTemplate } from '../../runtime/app-template.js'
import { generateJitInitModule } from '../../plugin/index.js'

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

  it('imports virtual:cer-jit-css', () => {
    expect(src).toContain('virtual:cer-jit-css')
  })

  it('imports virtual:cer-jit-init before virtual:cer-layouts so JIT CSS is enabled before elements upgrade', () => {
    expect(src).toContain('virtual:cer-jit-init')
    const initIdx = src.indexOf('virtual:cer-jit-init')
    const layoutsIdx = src.indexOf('virtual:cer-layouts')
    const pluginsIdx = src.indexOf('virtual:cer-plugins')
    expect(initIdx).toBeLessThan(layoutsIdx)
    expect(initIdx).toBeLessThan(pluginsIdx)
  })

  it('does not import enableJITCSS in the module body (delegated to virtual:cer-jit-init)', () => {
    // The enableJITCSS import must not appear in the template literal — it belongs
    // in virtual:cer-jit-init which runs during the static import phase, before
    // virtual:cer-layouts and virtual:cer-plugins upgrade custom elements.
    const templateStart = src.indexOf('return `')
    expect(src.slice(templateStart)).not.toContain("import { enableJITCSS }")
  })

  it('imports virtual:cer-content-components for markdown-backed custom elements', () => {
    expect(src).toContain('virtual:cer-content-components')
  })

  it('exports router', () => {
    expect(src).toContain('export { router }')
  })
})

describe('generateAppEntryTemplate', () => {
  it('includes virtual:cer-jit-init import', () => {
    const out = generateAppEntryTemplate()
    expect(out).toContain("import 'virtual:cer-jit-init'")
  })

  it('places virtual:cer-jit-init before virtual:cer-layouts and virtual:cer-plugins', () => {
    const out = generateAppEntryTemplate()
    const initIdx = out.indexOf('virtual:cer-jit-init')
    const layoutsIdx = out.indexOf('virtual:cer-layouts')
    const pluginsIdx = out.indexOf('virtual:cer-plugins')
    expect(initIdx).toBeGreaterThanOrEqual(0)
    expect(initIdx).toBeLessThan(layoutsIdx)
    expect(initIdx).toBeLessThan(pluginsIdx)
  })

  it('does not import enableJITCSS in the generated output (delegated to virtual:cer-jit-init)', () => {
    const out = generateAppEntryTemplate()
    expect(out).not.toContain("import { enableJITCSS }")
  })

  it('still includes all standard template content', () => {
    const out = generateAppEntryTemplate()
    expect(out).toContain('virtual:cer-jit-css')
    expect(out).toContain('virtual:cer-routes')
    expect(out).toContain('export { router }')
  })
})

describe('generateJitInitModule', () => {
  it('calls enableJITCSS() with no arguments when no options are set', () => {
    const out = generateJitInitModule({ content: [], extendedColors: false, customColors: undefined })
    expect(out).toContain('enableJITCSS()')
    expect(out).not.toContain('customColors')
    expect(out).not.toContain('extendedColors')
  })

  it('calls enableJITCSS() with no arguments when customColors is an empty object', () => {
    const out = generateJitInitModule({ content: [], extendedColors: false, customColors: {} })
    expect(out).toContain('enableJITCSS()')
    expect(out).not.toContain('customColors')
  })

  it('serializes a single color family into the enableJITCSS call', () => {
    const out = generateJitInitModule({ content: [], extendedColors: false, customColors: { brand: { '500': '#7c3aed' } } })
    expect(out).toContain('enableJITCSS({ customColors:')
    expect(out).toContain('"brand"')
    expect(out).toContain('"500"')
    expect(out).toContain('"#7c3aed"')
  })

  it('serializes multiple color families correctly', () => {
    const out = generateJitInitModule({
      content: [],
      extendedColors: false,
      customColors: { brand: { '100': '#ede9fe', '900': '#4c1d95' }, accent: { DEFAULT: '#f59e0b' } },
    })
    expect(out).toContain('"brand"')
    expect(out).toContain('"accent"')
    expect(out).toContain('"DEFAULT"')
    expect(out).toContain('"#f59e0b"')
  })

  it('serializes CSS variable references as color values', () => {
    const out = generateJitInitModule({
      content: [],
      extendedColors: false,
      customColors: { surface: { DEFAULT: 'var(--md-sys-color-surface)' } },
    })
    expect(out).toContain('"surface"')
    expect(out).toContain('var(--md-sys-color-surface)')
  })

  it('includes extendedColors: true when set', () => {
    const out = generateJitInitModule({ content: [], extendedColors: true, customColors: undefined })
    expect(out).toContain('extendedColors: true')
  })

  it('includes extendedColors array when set', () => {
    const out = generateJitInitModule({ content: [], extendedColors: ['slate', 'blue'], customColors: undefined })
    expect(out).toContain('extendedColors: ["slate","blue"]')
  })

  it('imports enableJITCSS from the jit-css subpath', () => {
    const out = generateJitInitModule({ content: [], extendedColors: false, customColors: undefined })
    expect(out).toContain('enableJITCSS')
    expect(out).toContain('custom-elements-runtime/jit-css')
  })
})
