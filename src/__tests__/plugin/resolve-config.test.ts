import { describe, it, expect } from 'vitest'
import { resolveConfig } from '../../plugin/index.js'

const ROOT = '/project'

describe('resolveConfig', () => {
  it('defaults mode to "spa"', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.mode).toBe('spa')
  })

  it('respects explicit mode', () => {
    expect(resolveConfig({ mode: 'ssr' }, ROOT).mode).toBe('ssr')
    expect(resolveConfig({ mode: 'ssg' }, ROOT).mode).toBe('ssg')
  })

  it('defaults srcDir to <root>/app', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.srcDir).toBe('/project/app')
  })

  it('respects explicit srcDir', () => {
    const cfg = resolveConfig({ srcDir: 'src' }, ROOT)
    expect(cfg.srcDir).toBe('/project/src')
  })

  it('derives pagesDir from srcDir', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.pagesDir).toBe('/project/app/pages')
  })

  it('derives layoutsDir from srcDir', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.layoutsDir).toBe('/project/app/layouts')
  })

  it('derives componentsDir from srcDir', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.componentsDir).toBe('/project/app/components')
  })

  it('derives composablesDir from srcDir', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.composablesDir).toBe('/project/app/composables')
  })

  it('derives pluginsDir from srcDir', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.pluginsDir).toBe('/project/app/plugins')
  })

  it('derives middlewareDir from srcDir', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.middlewareDir).toBe('/project/app/middleware')
  })

  it('derives serverApiDir from root (not srcDir)', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.serverApiDir).toBe('/project/server/api')
  })

  it('derives serverMiddlewareDir from root (not srcDir)', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.serverMiddlewareDir).toBe('/project/server/middleware')
  })

  it('defaults port to 3000', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.port).toBe(3000)
  })

  it('respects explicit port', () => {
    const cfg = resolveConfig({ port: 4000 }, ROOT)
    expect(cfg.port).toBe(4000)
  })

  it('defaults ssg.routes to "auto"', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.ssg.routes).toBe('auto')
  })

  it('respects explicit ssg.routes array', () => {
    const cfg = resolveConfig({ ssg: { routes: ['/a', '/b'] } }, ROOT)
    expect(cfg.ssg.routes).toEqual(['/a', '/b'])
  })

  it('defaults ssg.concurrency to 4', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.ssg.concurrency).toBe(4)
  })

  it('defaults ssg.fallback to false', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.ssg.fallback).toBe(false)
  })

  it('defaults autoImports.components to true', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.autoImports.components).toBe(true)
  })

  it('defaults autoImports.composables to true', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.autoImports.composables).toBe(true)
  })

  it('defaults autoImports.directives to true', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.autoImports.directives).toBe(true)
  })

  it('defaults autoImports.runtime to true', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.autoImports.runtime).toBe(true)
  })

  it('sets jitCss.content defaults relative to srcDir', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.jitCss.content).toContain('/project/app/pages/**/*.ts')
    expect(cfg.jitCss.content).toContain('/project/app/components/**/*.ts')
    expect(cfg.jitCss.content).toContain('/project/app/layouts/**/*.ts')
  })

  it('defaults jitCss.extendedColors to false', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.jitCss.extendedColors).toBe(false)
  })

  it('passes router.base through', () => {
    const cfg = resolveConfig({ router: { base: '/app', scrollToFragment: false } }, ROOT)
    expect(cfg.router.base).toBe('/app')
  })

  it('passes router.scrollToFragment through', () => {
    const cfg = resolveConfig({ router: { base: undefined, scrollToFragment: true } }, ROOT)
    expect(cfg.router.scrollToFragment).toBe(true)
  })

  it('includes root in the resolved config', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.root).toBe(ROOT)
  })

  it('defaults runtimeConfig.public to an empty object', () => {
    const cfg = resolveConfig({}, ROOT)
    expect(cfg.runtimeConfig.public).toEqual({})
  })

  it('passes runtimeConfig.public values through', () => {
    const cfg = resolveConfig({ runtimeConfig: { public: { apiBase: '/api', version: '1' } } }, ROOT)
    expect(cfg.runtimeConfig.public).toEqual({ apiBase: '/api', version: '1' })
  })

  it('preserves runtimeConfig.public when other runtimeConfig fields are omitted', () => {
    const cfg = resolveConfig({ runtimeConfig: { public: { foo: 42 } } }, ROOT)
    expect(cfg.runtimeConfig.public.foo).toBe(42)
  })
})
