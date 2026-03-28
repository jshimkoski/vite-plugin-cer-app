import MagicString from 'magic-string'
import { normalize } from 'pathe'

export interface AutoImportOptions {
  srcDir: string
  /** Absolute path to server/middleware/ directory */
  serverMiddlewareDir?: string
  /** Map of composable export name → absolute file path */
  composableExports?: Map<string, string>
}

// P1-5: Per-identifier import maps. Only the identifiers actually referenced in
// a file are injected — this eliminates the full-group injection that prevented
// tree-shaking when a page used only one framework composable.

/** Maps each runtime identifier to its source module. All from the main runtime package. */
const RUNTIME_MAP: Record<string, string> = {
  component: '@jasonshimmy/custom-elements-runtime',
  defineAsyncComponent: '@jasonshimmy/custom-elements-runtime',
  html: '@jasonshimmy/custom-elements-runtime',
  css: '@jasonshimmy/custom-elements-runtime',
  ref: '@jasonshimmy/custom-elements-runtime',
  computed: '@jasonshimmy/custom-elements-runtime',
  watch: '@jasonshimmy/custom-elements-runtime',
  watchEffect: '@jasonshimmy/custom-elements-runtime',
  useProps: '@jasonshimmy/custom-elements-runtime',
  useEmit: '@jasonshimmy/custom-elements-runtime',
  useOnConnected: '@jasonshimmy/custom-elements-runtime',
  useOnDisconnected: '@jasonshimmy/custom-elements-runtime',
  useOnAttributeChanged: '@jasonshimmy/custom-elements-runtime',
  useOnError: '@jasonshimmy/custom-elements-runtime',
  useStyle: '@jasonshimmy/custom-elements-runtime',
  useDesignTokens: '@jasonshimmy/custom-elements-runtime',
  useGlobalStyle: '@jasonshimmy/custom-elements-runtime',
  useExpose: '@jasonshimmy/custom-elements-runtime',
  useSlots: '@jasonshimmy/custom-elements-runtime',
  provide: '@jasonshimmy/custom-elements-runtime',
  inject: '@jasonshimmy/custom-elements-runtime',
  createComposable: '@jasonshimmy/custom-elements-runtime',
  nextTick: '@jasonshimmy/custom-elements-runtime',
  defineModel: '@jasonshimmy/custom-elements-runtime',
  getCurrentComponentContext: '@jasonshimmy/custom-elements-runtime',
  isReactiveState: '@jasonshimmy/custom-elements-runtime',
  unsafeHTML: '@jasonshimmy/custom-elements-runtime',
  decodeEntities: '@jasonshimmy/custom-elements-runtime',
  useTeleport: '@jasonshimmy/custom-elements-runtime',
}

/** Maps each directive identifier to its source module (directives sub-path). */
const DIRECTIVE_MAP: Record<string, string> = {
  when: '@jasonshimmy/custom-elements-runtime/directives',
  each: '@jasonshimmy/custom-elements-runtime/directives',
  match: '@jasonshimmy/custom-elements-runtime/directives',
  anchorBlock: '@jasonshimmy/custom-elements-runtime/directives',
}

/** Maps each framework composable to its source module. */
const FRAMEWORK_MAP: Record<string, string> = {
  useHead: '@jasonshimmy/vite-plugin-cer-app/composables',
  usePageData: '@jasonshimmy/vite-plugin-cer-app/composables',
  useInject: '@jasonshimmy/vite-plugin-cer-app/composables',
  useRuntimeConfig: '@jasonshimmy/vite-plugin-cer-app/composables',
  defineMiddleware: '@jasonshimmy/vite-plugin-cer-app/composables',
  defineServerMiddleware: '@jasonshimmy/vite-plugin-cer-app/composables',
  useSeoMeta: '@jasonshimmy/vite-plugin-cer-app/composables',
  useCookie: '@jasonshimmy/vite-plugin-cer-app/composables',
  useSession: '@jasonshimmy/vite-plugin-cer-app/composables',
  useAuth: '@jasonshimmy/vite-plugin-cer-app/composables',
  useFetch: '@jasonshimmy/vite-plugin-cer-app/composables',
  useRoute: '@jasonshimmy/vite-plugin-cer-app/composables',
  navigateTo: '@jasonshimmy/vite-plugin-cer-app/composables',
  useState: '@jasonshimmy/vite-plugin-cer-app/composables',
  useLocale: '@jasonshimmy/vite-plugin-cer-app/composables',
}

// All identifier maps — processed in order. Earlier maps take precedence for
// the "already imported from this module" duplicate check.
const ALL_MAPS = [RUNTIME_MAP, DIRECTIVE_MAP, FRAMEWORK_MAP]

/**
 * Returns true if the file already manually imports from the given source module.
 * When true, we skip auto-injecting identifiers from that module to avoid duplicates.
 */
function isAlreadyImported(code: string, sourceModule: string): boolean {
  return (
    code.includes(`from '${sourceModule}'`) ||
    code.includes(`from "${sourceModule}"`)
  )
}

/**
 * Builds minimal import statements containing only the identifiers actually
 * referenced in the file. Groups identifiers by source module. Skips modules
 * that the file already imports from manually.
 *
 * Returns an array of import statement strings (one per source module used).
 */
function buildMinimalImportStatements(code: string, maps: Record<string, string>[]): string[] {
  // Group identifier → source module, collecting only used ones.
  const grouped = new Map<string, string[]>()

  for (const map of maps) {
    for (const [identifier, sourceModule] of Object.entries(map)) {
      // Skip if the file already imports from this module.
      if (isAlreadyImported(code, sourceModule)) continue
      // Skip if identifier not referenced in the file.
      const pattern = new RegExp(`\\b${identifier}\\b`)
      if (!pattern.test(code)) continue

      const existing = grouped.get(sourceModule) ?? []
      existing.push(identifier)
      grouped.set(sourceModule, existing)
    }
  }

  return Array.from(grouped.entries()).map(
    ([mod, ids]) => `import { ${ids.join(', ')} } from '${mod}';`,
  )
}

/**
 * Auto-import transform: injects runtime and directive imports at the top of
 * files inside app/pages/, app/layouts/, or app/components/ if those
 * identifiers are not already imported.
 *
 * Returns the transformed code string, or null if no injection was needed.
 */
export function autoImportTransform(
  code: string,
  id: string,
  opts: AutoImportOptions,
): string | null {
  const normalizedId = normalize(id)
  const srcDir = normalize(opts.srcDir)

  // Transform files inside app/pages/, app/layouts/, app/components/, app/middleware/
  // AND special convention files directly in app/ (loading.ts, error.ts, etc.)
  const isSubDir =
    normalizedId.startsWith(srcDir + '/pages/') ||
    normalizedId.startsWith(srcDir + '/layouts/') ||
    normalizedId.startsWith(srcDir + '/components/') ||
    normalizedId.startsWith(srcDir + '/middleware/') ||
    normalizedId.startsWith(srcDir + '/composables/')
  // Files directly in srcDir root (e.g. app/loading.ts, app/error.ts)
  const isRootConventionFile =
    normalizedId.startsWith(srcDir + '/') &&
    !normalizedId.slice(srcDir.length + 1).includes('/')
  // server/middleware/ files also get framework auto-imports
  const serverMiddlewareDir = opts.serverMiddlewareDir ? normalize(opts.serverMiddlewareDir) : null
  const isServerMiddleware = serverMiddlewareDir != null && normalizedId.startsWith(serverMiddlewareDir + '/')
  const isTargetDir = isSubDir || isRootConventionFile || isServerMiddleware

  if (!isTargetDir) return null

  // Skip virtual modules and non-ts files
  if (id.startsWith('\0') || (!id.endsWith('.ts') && !id.endsWith('.js'))) return null

  // Skip virtual:cer-composables injection for files inside app/composables/ to
  // avoid circular imports (the virtual module re-exports from all composable files).
  const isComposablesDir = normalizedId.startsWith(srcDir + '/composables/')
  const composableImport = isComposablesDir ? null : buildComposableImport(code, opts.composableExports)

  // Build per-identifier import statements from all maps.
  const importLines = buildMinimalImportStatements(code, ALL_MAPS)

  if (importLines.length === 0 && !composableImport) return null

  const ms = new MagicString(code)
  const injectLines: string[] = [...importLines]

  if (composableImport) {
    injectLines.push(composableImport)
  }

  ms.prepend(injectLines.join('\n') + '\n')

  return ms.toString()
}

/**
 * Builds an import statement for any composable names used in the file
 * that are not already imported.
 * Returns null if no injection is needed.
 */
function buildComposableImport(code: string, composableExports?: Map<string, string>): string | null {
  if (!composableExports || composableExports.size === 0) return null

  // Skip if already importing from virtual:cer-composables
  if (code.includes("from 'virtual:cer-composables'") || code.includes('from "virtual:cer-composables"')) {
    return null
  }

  const needed: string[] = []
  for (const name of composableExports.keys()) {
    const pattern = new RegExp(`\\b${name}\\b`)
    if (pattern.test(code)) {
      needed.push(name)
    }
  }

  if (needed.length === 0) return null

  return `import { ${needed.join(', ')} } from 'virtual:cer-composables';`
}
