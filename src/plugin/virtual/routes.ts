import { existsSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { readFile } from 'node:fs/promises'
import { scanDirectory } from '../scanner.js'
import { buildRouteEntry, sortRoutes } from '../path-utils.js'

/**
 * Extracts the middleware array from a page file's source code without
 * importing the module. Handles both single-quoted and double-quoted strings.
 *
 * Matches patterns like:
 *   middleware: ['auth', 'admin']
 *   middleware: ["auth"]
 */
function extractMiddleware(source: string): string[] {
  const match = source.match(/middleware\s*:\s*\[([^\]]*)\]/)
  if (!match) return []
  const inner = match[1]
  const names = inner.match(/['"]([^'"]+)['"]/g)
  if (!names) return []
  return names.map((s) => s.replace(/['"]/g, ''))
}

/**
 * Extracts the layout name from a page file's source code without importing
 * the module. Returns null when no layout is declared (caller defaults to
 * 'default').
 *
 * Matches patterns like:
 *   layout: 'minimal'
 *   layout: "admin"
 */
function extractLayout(source: string): string | null {
  const match = source.match(/layout\s*:\s*['"]([^'"]+)['"]/)
  return match ? match[1] : null
}

/**
 * Extracts the `ssg.revalidate` number from a page file's source.
 * Returns null when not declared.
 *
 * Matches patterns like:
 *   revalidate: 60
 *   revalidate: 3600
 */
function extractRevalidate(source: string): number | null {
  const match = source.match(/revalidate\s*:\s*(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Extracts the `transition` value from a page file's source.
 * Returns the transition name string, true (boolean), or null if absent.
 *
 * Matches patterns like:
 *   transition: 'fade'
 *   transition: true
 */
function extractTransition(source: string): string | boolean | null {
  const strMatch = source.match(/transition\s*:\s*['"]([^'"]+)['"]/)
  if (strMatch) return strMatch[1]
  const boolMatch = source.match(/transition\s*:\s*(true|false)/)
  if (boolMatch) return boolMatch[1] === 'true'
  return null
}

/**
 * Extracts the per-route `hydrate` strategy from a page file's source.
 * Returns 'load', 'idle', 'visible', 'none', or null if absent.
 * 'load' is the default — callers skip emitting it to keep the bundle lean.
 *
 * Matches patterns like:
 *   hydrate: 'idle'
 *   hydrate: 'visible'
 *   hydrate: 'none'
 */
function extractHydrate(source: string): 'load' | 'idle' | 'visible' | 'none' | null {
  const match = source.match(/hydrate\s*:\s*['"]([^'"]+)['"]/)
  if (!match) return null
  const val = match[1]
  if (val === 'load' || val === 'idle' || val === 'visible' || val === 'none') return val
  return null
}

/**
 * Extracts the per-route `render` strategy from a page file's source.
 * Returns 'static', 'server', 'spa', or null if absent.
 *
 * Matches patterns like:
 *   render: 'server'
 *   render: 'spa'
 *   render: 'static'
 */
function extractRender(source: string): 'static' | 'server' | 'spa' | null {
  const match = source.match(/render\s*:\s*['"]([^'"]+)['"]/)
  if (!match) return null
  const val = match[1]
  if (val === 'static' || val === 'server' || val === 'spa') return val
  return null
}

/**
 * Extracts the `title` string from a page file's `meta` export.
 * Returns null when not declared.
 *
 * Matches patterns like:
 *   title: 'My Page Title'
 *   title: "My Page Title"
 */
function extractTitle(source: string): string | null {
  const match = source.match(/title\s*:\s*['"]([^'"]+)['"]/)
  return match ? match[1] : null
}

/**
 * Resolves the layout chain for a page by walking its ancestor directories
 * inside pagesDir looking for `_layout.ts` files. Each `_layout.ts` must
 * export a default string naming a layout in `app/layouts/`.
 *
 * Returns null when no nested layouts are found (single-layout path is used).
 *
 * Example:
 *   app/pages/admin/_layout.ts  →  export default 'minimal'
 *   app/pages/admin/users.ts    →  meta.layout: 'default' (or omitted)
 *   → layoutChain = ['default', 'minimal']
 */
async function resolveLayoutChain(
  filePath: string,
  pagesDir: string,
  outerLayout: string | null,
): Promise<string[] | null> {
  const rel = relative(pagesDir, filePath)
  const parts = rel.split('/').slice(0, -1) // directory segments only

  if (parts.length === 0) return null

  const extras: string[] = []
  let currentDir = pagesDir
  for (const part of parts) {
    currentDir = join(currentDir, part)
    const layoutFile = join(currentDir, '_layout.ts')
    if (existsSync(layoutFile)) {
      try {
        const src = await readFile(layoutFile, 'utf-8')
        const match = src.match(/export\s+default\s+['"]([^'"]+)['"]/)
        if (match) extras.push(match[1])
      } catch (err) {
        console.warn(`[cer-app] Could not read layout file "${layoutFile}":`, err)
      }
    }
  }

  if (extras.length === 0) return null
  return [outerLayout ?? 'default', ...extras]
}

export interface I18nRouteConfig {
  locales: string[]
  defaultLocale: string
  strategy: 'prefix' | 'prefix_except_default' | 'no_prefix'
}

/**
 * Generates the virtual:cer-routes module code.
 *
 * Each page module is loaded lazily via a `load()` function — a dynamic
 * import that both registers the custom element (side-effect of component())
 * and returns the tag name as `default`.  This lets Vite split each page into
 * its own chunk so only the routes the user actually visits are downloaded.
 *
 * Middleware names and layout names are extracted at build time with a
 * lightweight regex so no eager import is needed.
 *
 * Special conventions:
 *   app/pages/404.ts  →  path "/:all*"  (catch-all not-found page)
 *
 * When `i18n` is provided, non-catch-all routes are duplicated for each locale:
 *   strategy 'prefix'                → `/en/about`, `/fr/about`
 *   strategy 'prefix_except_default' → `/about`, `/fr/about`
 *   strategy 'no_prefix'             → routes are unchanged
 */
export async function generateRoutesCode(pagesDir: string, i18n?: I18nRouteConfig | null): Promise<string> {
  if (!existsSync(pagesDir)) {
    return `// AUTO-GENERATED by @jasonshimmy/vite-plugin-cer-app\nconst routes = []\nexport default routes\n`
  }

  const allFiles = await scanDirectory('**/*.ts', pagesDir)
  // Exclude _layout.ts files — they are directory-level layout config, not pages.
  const files = allFiles.filter((f) => basename(f) !== '_layout.ts')

  if (files.length === 0) {
    return `// AUTO-GENERATED by @jasonshimmy/vite-plugin-cer-app\nconst routes = []\nexport default routes\n`
  }

  const rawEntries = files.map((f) => {
    const entry = buildRouteEntry(f, pagesDir)
    // 404.ts convention: treat as catch-all not-found route
    if (basename(f) === '404.ts') {
      return { ...entry, routePath: '/:all*', tagName: 'page-404', isDynamic: true, isCatchAll: true }
    }
    return entry
  })

  // Deduplicate by routePath — keep the first occurrence after sorting to
  // avoid "Duplicate route path detected" warnings (e.g. when both 404.ts
  // and [...all].ts resolve to the same /:all* catch-all route).
  const seen = new Set<string>()
  const entries = rawEntries.filter((e) => {
    if (seen.has(e.routePath)) return false
    seen.add(e.routePath)
    return true
  })

  const sorted = sortRoutes(entries)

  // Read each file's source once to extract static metadata without eagerly
  // importing the module, then resolve any nested layout chains.
  const metaPerEntry: Array<{
    middleware: string[]
    layout: string | null
    layoutChain: string[] | null
    revalidate: number | null
    transition: string | boolean | null
    render: 'static' | 'server' | 'spa' | null
    hydrate: 'load' | 'idle' | 'visible' | 'none' | null
    title: string | null
  }> = await Promise.all(
    sorted.map(async (entry) => {
      try {
        const src = await readFile(entry.filePath, 'utf-8')
        const layout = extractLayout(src)
        const layoutChain = await resolveLayoutChain(entry.filePath, pagesDir, layout)
        return {
          middleware: extractMiddleware(src),
          layout,
          layoutChain,
          revalidate: extractRevalidate(src),
          transition: extractTransition(src),
          render: extractRender(src),
          hydrate: extractHydrate(src),
          title: extractTitle(src),
        }
      } catch {
        return { middleware: [], layout: null, layoutChain: null, revalidate: null, transition: null, render: null, hydrate: null, title: null }
      }
    }),
  )

  const lines: string[] = ['// AUTO-GENERATED by @jasonshimmy/vite-plugin-cer-app', '']

  // When i18n is active, expand each non-catch-all route into locale-prefixed variants.
  // Catch-all routes (/:all*) are never prefixed — they match anything including locale paths.
  function buildLocaleRouteItems(routePath: string, loadFn: string, metaStr: string, mwChainBody: string, isCatchAll: boolean): string[] {
    if (!i18n || i18n.strategy === 'no_prefix' || isCatchAll) {
      return [buildRouteItem(routePath, loadFn, metaStr, mwChainBody)]
    }
    const items: string[] = []
    for (const locale of i18n.locales) {
      const isDefault = locale === i18n.defaultLocale
      const skip = isDefault && i18n.strategy === 'prefix_except_default'
      const prefixedPath = skip ? routePath : JSON.stringify(`/${locale}${JSON.parse(routePath)}`)
      const localeMeta = `    meta: { ...${metaStr.trim() ? metaStr.replace(/^\s*meta: \{/, '{').replace(/\},\s*$/, '}') : '{}'}, locale: ${JSON.stringify(locale)} },\n`
      items.push(buildRouteItem(prefixedPath, loadFn, localeMeta, mwChainBody))
    }
    return items
  }

  function buildRouteItem(routePath: string, loadFn: string, metaStr: string, mwChainBody: string): string {
    if (!mwChainBody) {
      return (
        `  {\n` +
        `    path: ${routePath},\n` +
        `    load: ${loadFn},\n` +
        metaStr +
        `  }`
      )
    }
    return (
      `  {\n` +
      `    path: ${routePath},\n` +
      `    load: ${loadFn},\n` +
      metaStr +
      mwChainBody +
      `  }`
    )
  }

  // Build routes array with lazy load() functions for code splitting.
  const routeItems = sorted.map((entry, i) => {
    const { middleware: mw, layout, layoutChain, revalidate, transition, render, hydrate, title } = metaPerEntry[i]
    const filePath = JSON.stringify(entry.filePath)
    const tagName = JSON.stringify(entry.tagName)
    const routePath = JSON.stringify(entry.routePath)

    // The load() function dynamically imports the page module which:
    //   1. Runs component() as a side effect, registering the custom element
    //   2. Returns the tag name string as `default` so the router knows what to render
    //   3. Forwards the optional `loader` export for SSR data hydration
    const loadFn = `() => import(${filePath}).then(mod => ({ default: ${tagName}, loader: mod.loader ?? null }))`

    // Build meta object — only emit fields that are set
    const metaFields: string[] = []
    if (layoutChain !== null) {
      metaFields.push(`layoutChain: ${JSON.stringify(layoutChain)}`)
    } else if (layout !== null) {
      metaFields.push(`layout: ${JSON.stringify(layout)}`)
    }
    if (revalidate !== null) {
      metaFields.push(`ssg: { revalidate: ${revalidate} }`)
    }
    if (transition !== null) {
      metaFields.push(`transition: ${JSON.stringify(transition)}`)
    }
    if (render !== null) {
      metaFields.push(`render: ${JSON.stringify(render)}`)
    }
    // 'load' is the default — only emit non-default values to keep bundle lean.
    if (hydrate !== null && hydrate !== 'load') {
      metaFields.push(`hydrate: ${JSON.stringify(hydrate)}`)
    }
    if (title !== null) {
      metaFields.push(`title: ${JSON.stringify(title)}`)
    }
    const metaStr = metaFields.length > 0 ? `    meta: { ${metaFields.join(', ')} },\n` : ''

    let mwChainBody = ''
    if (mw.length > 0) {
      // Inline the middleware names as a literal array (extracted at build time)
      // so we never need to eagerly import the page module just to read meta.
      const mwLiteral = JSON.stringify(mw)
      mwChainBody = (
        `    beforeEnter: async (to, from) => {\n` +
        `      const { middleware } = await import('virtual:cer-middleware')\n` +
        `      const _names = ${mwLiteral}\n` +
        `      let _idx = 0\n` +
        `      let _guardResult = true\n` +
        `      const _runNext = async () => {\n` +
        `        if (_idx >= _names.length) return\n` +
        `        const name = _names[_idx++]\n` +
        `        const handler = middleware[name]\n` +
        `        if (typeof handler !== 'function') { await _runNext(); return }\n` +
        `        let _calledNext = false\n` +
        `        const next = async () => { _calledNext = true; await _runNext() }\n` +
        `        let result\n` +
        `        try {\n` +
        `          result = await handler(to, from, next)\n` +
        `        } catch (err) {\n` +
        `          console.error('[cer-app] Middleware "' + name + '" threw an error:', err)\n` +
        `          _guardResult = false; return\n` +
        `        }\n` +
        `        if (!_calledNext) {\n` +
        `          if (typeof result === 'string') { _guardResult = result; return }\n` +
        `          if (result === false) { _guardResult = false; return }\n` +
        `        }\n` +
        `      }\n` +
        `      await _runNext()\n` +
        `      return _guardResult\n` +
        `    },\n`
      )
    }

    return buildLocaleRouteItems(routePath, loadFn, metaStr, mwChainBody, entry.isCatchAll)
  })

  lines.push('const routes = [')
  lines.push(routeItems.flat().join(',\n'))
  lines.push(']')
  lines.push('')
  lines.push('export default routes')
  lines.push('')

  return lines.join('\n')
}
