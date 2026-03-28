import { describe, it, expect } from 'vitest'
import { autoImportTransform } from '../../../plugin/transforms/auto-import.js'

const srcDir = '/project/app'
const opts = { srcDir }

const RUNTIME_PKG = `'@jasonshimmy/custom-elements-runtime'`
const DIRECTIVES_PKG = `'@jasonshimmy/custom-elements-runtime/directives'`
const FRAMEWORK_PKG = `'@jasonshimmy/vite-plugin-cer-app/composables'`

// ─── Target-directory gating ─────────────────────────────────────────────────

describe('autoImportTransform — target directory gating', () => {
  it('returns null for files outside pages/, layouts/, components/, middleware/, composables/', () => {
    expect(
      autoImportTransform("component('x', () => html``)", '/project/app/plugins/my-plugin.ts', opts),
    ).toBeNull()
  })

  it('returns null for virtual modules (id starts with \\0)', () => {
    expect(
      autoImportTransform("component('x', () => html``)", '\0virtual:cer-routes', opts),
    ).toBeNull()
  })

  it('returns null for non-.ts/.js files', () => {
    expect(
      autoImportTransform('<div>content</div>', '/project/app/pages/about.html', opts),
    ).toBeNull()
  })

  it('transforms files in pages/', () => {
    const result = autoImportTransform(
      "component('page-about', () => html`<h1>About</h1>`)",
      '/project/app/pages/about.ts',
      opts,
    )
    expect(result).not.toBeNull()
  })

  it('transforms files in layouts/', () => {
    const result = autoImportTransform(
      "component('layout-default', () => html`<slot></slot>`)",
      '/project/app/layouts/default.ts',
      opts,
    )
    expect(result).not.toBeNull()
  })

  it('transforms files in components/', () => {
    const result = autoImportTransform(
      "component('my-button', () => html`<button></button>`)",
      '/project/app/components/my-button.ts',
      opts,
    )
    expect(result).not.toBeNull()
  })

  it('transforms files in middleware/ (so defineMiddleware is auto-imported)', () => {
    const result = autoImportTransform(
      "export default defineMiddleware(() => true)",
      '/project/app/middleware/auth.ts',
      opts,
    )
    expect(result).not.toBeNull()
    expect(result).toContain('defineMiddleware')
  })

  it('injects framework imports for composables/ (in scope)', () => {
    const result = autoImportTransform("export default defineMiddleware(() => true)", '/project/app/composables/useTheme.ts', opts)
    expect(result).not.toBeNull()
    expect(result).toContain('defineMiddleware')
  })
})

// ─── No injection needed ─────────────────────────────────────────────────────

describe('autoImportTransform — no injection needed', () => {
  it('returns null when no runtime or directive identifiers are used', () => {
    expect(
      autoImportTransform('const greeting = "hello"', '/project/app/pages/about.ts', opts),
    ).toBeNull()
  })

  it('returns null when runtime is already imported from the package', () => {
    const code =
      `import { component, html } from ${RUNTIME_PKG}\ncomponent('test', () => html\`\`)`
    expect(autoImportTransform(code, '/project/app/pages/about.ts', opts)).toBeNull()
  })

  it('returns null when directives already imported and no other identifiers used', () => {
    const code = `import { when } from ${DIRECTIVES_PKG}\nconst x = 1`
    expect(autoImportTransform(code, '/project/app/pages/about.ts', opts)).toBeNull()
  })
})

// ─── Runtime import injection ────────────────────────────────────────────────

describe('autoImportTransform — runtime import injection', () => {
  it('injects runtime import when "component" identifier is used', () => {
    const result = autoImportTransform(
      "component('page-about', () => {})",
      '/project/app/pages/about.ts',
      opts,
    )!
    expect(result).toContain(`from ${RUNTIME_PKG}`)
    expect(result).toContain('component')
  })

  it('injects runtime import when "html" identifier is used', () => {
    const result = autoImportTransform(
      'const t = html`<div></div>`',
      '/project/app/pages/about.ts',
      opts,
    )!
    expect(result).toContain(`from ${RUNTIME_PKG}`)
  })

  it('injects runtime import when "ref" identifier is used', () => {
    const result = autoImportTransform(
      'const count = ref(0)',
      '/project/app/pages/counter.ts',
      opts,
    )!
    expect(result).toContain(`from ${RUNTIME_PKG}`)
  })

  it('prepends import at the very top of the file', () => {
    const original = "component('x', () => html``)"
    const result = autoImportTransform(original, '/project/app/pages/test.ts', opts)!
    expect(result.startsWith('import {')).toBe(true)
  })

  it('does not add duplicate runtime import when already present', () => {
    const code = `import { component } from ${RUNTIME_PKG}\ncomponent('x', () => {})`
    const result = autoImportTransform(code, '/project/app/pages/test.ts', opts)
    const count = (result ?? code).split(`from ${RUNTIME_PKG}`).length - 1
    expect(count).toBe(1)
  })
})

// ─── Directive import injection ──────────────────────────────────────────────

describe('autoImportTransform — directive import injection', () => {
  it('injects directive import when "when" identifier is used', () => {
    const result = autoImportTransform(
      'const t = when(true, html`<span>yes</span>`)',
      '/project/app/pages/about.ts',
      opts,
    )!
    expect(result).toContain(`from ${DIRECTIVES_PKG}`)
  })

  it('injects directive import when "each" identifier is used', () => {
    const result = autoImportTransform(
      'const t = each(items, (item) => html`<li>${item}</li>`)',
      '/project/app/pages/list.ts',
      opts,
    )!
    expect(result).toContain(`from ${DIRECTIVES_PKG}`)
  })

  it('injects directive import when "match" identifier is used', () => {
    const result = autoImportTransform(
      'const t = match(state, {})',
      '/project/app/pages/test.ts',
      opts,
    )!
    expect(result).toContain(`from ${DIRECTIVES_PKG}`)
  })

  it('does not add duplicate directive import when already present', () => {
    const code = `import { when } from ${DIRECTIVES_PKG}\nconst t = when(true, html\`\`)`
    // html is used → runtime import needed, but directives should not be duplicated
    const result = autoImportTransform(code, '/project/app/pages/test.ts', opts)!
    const count = (result ?? code).split(`from ${DIRECTIVES_PKG}`).length - 1
    expect(count).toBe(1)
  })
})

// ─── Both runtime + directive injected ───────────────────────────────────────

describe('autoImportTransform — both runtime and directive injection', () => {
  it('injects both when both are needed', () => {
    const code = "component('x', () => html`${when(true, html`<span></span>`)}`)"
    const result = autoImportTransform(code, '/project/app/pages/test.ts', opts)!
    expect(result).toContain(`from ${RUNTIME_PKG}`)
    expect(result).toContain(`from ${DIRECTIVES_PKG}`)
  })

  it('only injects runtime when directives already imported', () => {
    const code = `import { when } from ${DIRECTIVES_PKG}\ncomponent('x', () => html\`\`)`
    const result = autoImportTransform(code, '/project/app/pages/test.ts', opts)!
    expect(result).toContain(`from ${RUNTIME_PKG}`)
    const directivesCount = result.split(`from ${DIRECTIVES_PKG}`).length - 1
    expect(directivesCount).toBe(1) // only the original, not a new one
  })
})

// ─── Framework composable injection (useHead) ────────────────────────────────

describe('autoImportTransform — framework composable injection', () => {
  it('injects useHead import when useHead is used', () => {
    const code = "component('page-about', () => { useHead({ title: 'About' }); return html`<h1>About</h1>` })"
    const result = autoImportTransform(code, '/project/app/pages/about.ts', opts)!
    expect(result).toContain(`from ${FRAMEWORK_PKG}`)
    expect(result).toContain('useHead')
  })

  it('does not inject useHead when not used', () => {
    const code = "component('page-about', () => html`<h1>About</h1>`)"
    const result = autoImportTransform(code, '/project/app/pages/about.ts', opts)
    expect(result === null || !result.includes(FRAMEWORK_PKG)).toBe(true)
  })

  it('does not add duplicate useHead import when already present', () => {
    const code = `import { useHead } from ${FRAMEWORK_PKG}\ncomponent('x', () => { useHead({ title: 'X' }); return html\`\` })`
    const result = autoImportTransform(code, '/project/app/pages/test.ts', opts)!
    const count = (result ?? code).split(`from ${FRAMEWORK_PKG}`).length - 1
    expect(count).toBe(1)
  })

  it('injects usePageData import when usePageData is used', () => {
    const code = "component('page-items-id', () => { const data = usePageData(); return html`<div></div>` })"
    const result = autoImportTransform(code, '/project/app/pages/items/[id].ts', opts)!
    expect(result).toContain(`from ${FRAMEWORK_PKG}`)
    expect(result).toContain('usePageData')
  })

  it('injects both useHead and usePageData when both are used', () => {
    const code = "component('page-blog-slug', () => { useHead({ title: 'x' }); const data = usePageData(); return html`<div></div>` })"
    const result = autoImportTransform(code, '/project/app/pages/blog/[slug].ts', opts)!
    expect(result).toContain('useHead')
    expect(result).toContain('usePageData')
    // Only one import statement from the framework package
    const count = result.split(`from ${FRAMEWORK_PKG}`).length - 1
    expect(count).toBe(1)
  })

  it('injects useInject import when useInject is used', () => {
    const code = "component('page-about', () => { const svc = useInject('my-service'); return html`<div></div>` })"
    const result = autoImportTransform(code, '/project/app/pages/about.ts', opts)!
    expect(result).toContain(`from ${FRAMEWORK_PKG}`)
    expect(result).toContain('useInject')
  })

  it('injects usePageData for root-level convention files (loading.ts, error.ts)', () => {
    const code = "component('page-loading', () => { const d = usePageData(); return html`<div></div>` })"
    const result = autoImportTransform(code, '/project/app/loading.ts', opts)!
    expect(result).toContain('usePageData')
  })

  it('injects useRuntimeConfig import when useRuntimeConfig is used', () => {
    const code = "component('page-dashboard', () => { const cfg = useRuntimeConfig(); return html`<div></div>` })"
    const result = autoImportTransform(code, '/project/app/pages/dashboard.ts', opts)!
    expect(result).toContain(`from ${FRAMEWORK_PKG}`)
    expect(result).toContain('useRuntimeConfig')
  })

  it('injects useRuntimeConfig alongside other framework composables', () => {
    const code = "component('page-x', () => { useHead({ title: 'x' }); const cfg = useRuntimeConfig(); return html`<div></div>` })"
    const result = autoImportTransform(code, '/project/app/pages/x.ts', opts)!
    expect(result).toContain('useHead')
    expect(result).toContain('useRuntimeConfig')
    const count = result.split(`from ${FRAMEWORK_PKG}`).length - 1
    expect(count).toBe(1)
  })

  it('injects useSeoMeta import when useSeoMeta is used', () => {
    const code = "component('page-home', () => { useSeoMeta({ title: 'Home', description: 'Welcome' }); return html`<h1>Home</h1>` })"
    const result = autoImportTransform(code, '/project/app/pages/index.ts', opts)!
    expect(result).toContain(`from ${FRAMEWORK_PKG}`)
    expect(result).toContain('useSeoMeta')
  })

  it('injects useCookie import when useCookie is used', () => {
    const code = "component('page-profile', () => { const session = useCookie('session'); return html`<div></div>` })"
    const result = autoImportTransform(code, '/project/app/pages/profile.ts', opts)!
    expect(result).toContain(`from ${FRAMEWORK_PKG}`)
    expect(result).toContain('useCookie')
  })

  it('injects useSeoMeta and useCookie alongside other framework composables in a single import', () => {
    const code = "component('page-shop', () => { useSeoMeta({ title: 'Shop' }); const cart = useCookie('cart'); return html`<div></div>` })"
    const result = autoImportTransform(code, '/project/app/pages/shop.ts', opts)!
    expect(result).toContain('useSeoMeta')
    expect(result).toContain('useCookie')
    const count = result.split(`from ${FRAMEWORK_PKG}`).length - 1
    expect(count).toBe(1)
  })

  it('injects defineServerMiddleware import when defineServerMiddleware is used', () => {
    const code = "export default defineServerMiddleware((_req, _res, next) => { next() })"
    const result = autoImportTransform(code, '/project/app/middleware/server-check.ts', opts)!
    expect(result).toContain(`from ${FRAMEWORK_PKG}`)
    expect(result).toContain('defineServerMiddleware')
  })

  it('injects useSession import when useSession is used', () => {
    const code = "component('page-x', () => { const s = useSession(); return html`<div></div>` })"
    const result = autoImportTransform(code, '/project/app/pages/x.ts', opts)!
    expect(result).toContain(`from ${FRAMEWORK_PKG}`)
    expect(result).toContain('useSession')
  })

  it('injects useState import when useState is used', () => {
    const code = "component('layout-default', () => { const title = useState('pageTitle', 'My App'); return html`<title>${title.value}</title><slot></slot>` })"
    const result = autoImportTransform(code, '/project/app/layouts/default.ts', opts)!
    expect(result).toContain(`from ${FRAMEWORK_PKG}`)
    expect(result).toContain('useState')
  })

  it('does not inject useState when not used', () => {
    const code = "component('layout-default', () => html`<slot></slot>`)"
    const result = autoImportTransform(code, '/project/app/layouts/default.ts', opts)
    expect(result === null || !result!.includes('useState')).toBe(true)
  })

  it('injects useState alongside other framework composables in a single import', () => {
    const code = "component('layout-x', () => { useHead({ title: 'x' }); const title = useState('t', ''); return html`` })"
    const result = autoImportTransform(code, '/project/app/layouts/x.ts', opts)!
    expect(result).toContain('useHead')
    expect(result).toContain('useState')
    const count = result.split(`from ${FRAMEWORK_PKG}`).length - 1
    expect(count).toBe(1)
  })

  it('injects useLocale import when useLocale is used', () => {
    const code = "component('page-about', () => { const { locale } = useLocale(); return html`<p>${locale}</p>` })"
    const result = autoImportTransform(code, '/project/app/pages/about.ts', opts)!
    expect(result).toContain(`from ${FRAMEWORK_PKG}`)
    expect(result).toContain('useLocale')
  })

  it('does not inject useLocale when not used', () => {
    const code = "component('page-about', () => html`<h1>About</h1>`)"
    const result = autoImportTransform(code, '/project/app/pages/about.ts', opts)
    expect(result === null || !result!.includes('useLocale')).toBe(true)
  })

  it('injects useLocale alongside other framework composables in a single import', () => {
    const code = "component('page-x', () => { useHead({ title: 'x' }); const { locale } = useLocale(); return html`` })"
    const result = autoImportTransform(code, '/project/app/pages/x.ts', opts)!
    expect(result).toContain('useHead')
    expect(result).toContain('useLocale')
    const count = result.split(`from ${FRAMEWORK_PKG}`).length - 1
    expect(count).toBe(1)
  })
})

describe('autoImportTransform — server/middleware/ directory', () => {
  const serverOpts = { srcDir, serverMiddlewareDir: '/project/server/middleware' }

  it('transforms files in server/middleware/ when serverMiddlewareDir is provided', () => {
    const code = "export default defineServerMiddleware((_req, _res, next) => { next() })"
    const result = autoImportTransform(code, '/project/server/middleware/cors.ts', serverOpts)
    expect(result).not.toBeNull()
  })

  it('injects defineServerMiddleware import for server/middleware/ files', () => {
    const code = "export default defineServerMiddleware((_req, _res, next) => { next() })"
    const result = autoImportTransform(code, '/project/server/middleware/cors.ts', serverOpts)!
    expect(result).toContain('defineServerMiddleware')
    expect(result).toContain(`from ${FRAMEWORK_PKG}`)
  })

  it('injects useSession import for server/middleware/ files', () => {
    const code = "export default defineServerMiddleware(async (_req, res, next) => { const s = useSession(); const d = await s.get(); if (!d) { res.end(); return } next() })"
    const result = autoImportTransform(code, '/project/server/middleware/auth.ts', serverOpts)!
    expect(result).toContain('useSession')
  })

  it('injects useCookie import for server/middleware/ files', () => {
    const code = "export default defineServerMiddleware((req, res, next) => { const token = useCookie('token'); next() })"
    const result = autoImportTransform(code, '/project/server/middleware/auth.ts', serverOpts)!
    expect(result).toContain('useCookie')
  })

  it('does NOT transform server/middleware/ when serverMiddlewareDir is not set', () => {
    const code = "export default defineServerMiddleware((_req, _res, next) => { next() })"
    const result = autoImportTransform(code, '/project/server/middleware/cors.ts', { srcDir })
    expect(result).toBeNull()
  })
})

// ─── Composable import injection ─────────────────────────────────────────────

describe('autoImportTransform — composable import injection', () => {
  const COMPOSABLES_PKG = `'virtual:cer-composables'`

  it('injects composable import when a registered composable is used', () => {
    const composableExports = new Map([['useTheme', '/project/app/composables/useTheme.ts']])
    const code = "component('page-x', () => { const t = useTheme(); return html`<div></div>` })"
    const result = autoImportTransform(code, '/project/app/pages/x.ts', { srcDir, composableExports })!
    expect(result).toContain(`from ${COMPOSABLES_PKG}`)
    expect(result).toContain('useTheme')
  })

  it('does not inject composable import when composable is not used in file', () => {
    const composableExports = new Map([['useTheme', '/project/app/composables/useTheme.ts']])
    const code = "component('page-x', () => html`<h1>Hello</h1>`)"
    const result = autoImportTransform(code, '/project/app/pages/x.ts', { srcDir, composableExports })
    expect(result === null || !result!.includes('virtual:cer-composables')).toBe(true)
  })

  it('does not inject when already imported from virtual:cer-composables (single quotes)', () => {
    const composableExports = new Map([['useTheme', '/project/app/composables/useTheme.ts']])
    const code = `import { useTheme } from 'virtual:cer-composables'\ncomponent('x', () => { useTheme(); return html\`\` })`
    const result = autoImportTransform(code, '/project/app/pages/x.ts', { srcDir, composableExports })
    const count = (result ?? code).split(`from ${COMPOSABLES_PKG}`).length - 1
    expect(count).toBe(1)
  })

  it('does not inject when already imported from virtual:cer-composables (double quotes)', () => {
    const composableExports = new Map([['useTheme', '/project/app/composables/useTheme.ts']])
    const code = `import { useTheme } from "virtual:cer-composables"\ncomponent('x', () => { useTheme(); return html\`\` })`
    const result = autoImportTransform(code, '/project/app/pages/x.ts', { srcDir, composableExports })
    const count = (result ?? code).split('virtual:cer-composables').length - 1
    expect(count).toBe(1)
  })

  it('injects all used composables in a single import statement', () => {
    const composableExports = new Map([
      ['useTheme', '/project/app/composables/useTheme.ts'],
      ['useAuth', '/project/app/composables/useAuth.ts'],
    ])
    const code = "component('page-x', () => { useTheme(); useAuth(); return html`<div></div>` })"
    const result = autoImportTransform(code, '/project/app/pages/x.ts', { srcDir, composableExports })!
    expect(result).toContain('useTheme')
    expect(result).toContain('useAuth')
    const count = result.split(`from ${COMPOSABLES_PKG}`).length - 1
    expect(count).toBe(1)
  })

  it('returns null when composableExports is empty and no other identifiers used', () => {
    const composableExports = new Map<string, string>()
    const code = 'const x = 1'
    const result = autoImportTransform(code, '/project/app/pages/x.ts', { srcDir, composableExports })
    expect(result).toBeNull()
  })

  it('returns null when composableExports is undefined and no other identifiers used', () => {
    const code = 'const x = 1'
    const result = autoImportTransform(code, '/project/app/pages/x.ts', { srcDir })
    expect(result).toBeNull()
  })
})

// ─── P1-5: Per-identifier tree shaking ────────────────────────────────────────

describe('autoImportTransform — per-identifier tree shaking (P1-5)', () => {
  it('injects only used identifiers, not all runtime identifiers', () => {
    const code = "const count = ref(0)"
    const result = autoImportTransform(code, '/project/app/pages/counter.ts', opts)!
    // Only ref should be imported, not component/html/computed etc.
    expect(result).toContain('ref')
    expect(result).not.toContain('computed')
    expect(result).not.toContain('watchEffect')
    expect(result).not.toContain('useEmit')
  })

  it('injects only the used directive, not all directives', () => {
    const code = "const t = each(items, (i) => html`<li>${i}</li>`)"
    const result = autoImportTransform(code, '/project/app/pages/list.ts', opts)!
    expect(result).toContain('each')
    expect(result).not.toContain('when')
    expect(result).not.toContain('match')
    expect(result).not.toContain('anchorBlock')
  })

  it('injects only the used framework composable, not the full framework set', () => {
    const code = "component('page-x', () => { const r = useRoute(); return html`<div></div>` })"
    const result = autoImportTransform(code, '/project/app/pages/x.ts', opts)!
    expect(result).toContain('useRoute')
    expect(result).not.toContain('useHead')
    expect(result).not.toContain('useFetch')
    expect(result).not.toContain('useState')
  })

  it('groups multiple used identifiers from the same module into one import statement', () => {
    const code = "const a = ref(0)\nconst b = computed(() => a.value * 2)"
    const result = autoImportTransform(code, '/project/app/pages/computed.ts', opts)!
    // Both ref and computed are from the runtime — should be one import
    const count = result.split(`from ${RUNTIME_PKG}`).length - 1
    expect(count).toBe(1)
    expect(result).toContain('ref')
    expect(result).toContain('computed')
  })

  it('defineAsyncComponent is injected when used (P2-4 auto-import)', () => {
    const code = "defineAsyncComponent('heavy-editor', () => import('./impl.ts').then(m => m.render))"
    const result = autoImportTransform(code, '/project/app/components/heavy-editor.ts', opts)!
    expect(result).toContain('defineAsyncComponent')
    expect(result).toContain(`from ${RUNTIME_PKG}`)
  })
})
