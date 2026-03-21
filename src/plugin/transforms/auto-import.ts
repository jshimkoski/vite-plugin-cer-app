import MagicString from 'magic-string'
import { normalize } from 'pathe'

export interface AutoImportOptions {
  srcDir: string
  /** Map of composable export name → absolute file path */
  composableExports?: Map<string, string>
}

const RUNTIME_IMPORTS = `import { component, html, css, ref, computed, watch, watchEffect, useProps, useEmit, useOnConnected, useOnDisconnected, useOnAttributeChanged, useOnError, useStyle, useDesignTokens, useGlobalStyle, useExpose, useSlots, provide, inject, createComposable, nextTick, defineModel, getCurrentComponentContext, isReactiveState, unsafeHTML, decodeEntities, useTeleport } from '@jasonshimmy/custom-elements-runtime';`

const DIRECTIVE_IMPORTS = `import { when, each, match, anchorBlock } from '@jasonshimmy/custom-elements-runtime/directives';`

const FRAMEWORK_IMPORTS = `import { useHead, usePageData, useInject, useRuntimeConfig, defineMiddleware, useSeoMeta, useCookie } from '@jasonshimmy/vite-plugin-cer-app/composables';`

const FRAMEWORK_IDENTIFIERS = ['useHead', 'usePageData', 'useInject', 'useRuntimeConfig', 'defineMiddleware', 'useSeoMeta', 'useCookie']

const RUNTIME_IDENTIFIERS = [
  'component',
  'html',
  'css',
  'ref',
  'computed',
  'watch',
  'watchEffect',
  'useProps',
  'useEmit',
  'useOnConnected',
  'useOnDisconnected',
  'useOnAttributeChanged',
  'useOnError',
  'useStyle',
  'useDesignTokens',
  'useGlobalStyle',
  'useExpose',
  'useSlots',
  'provide',
  'inject',
  'createComposable',
  'nextTick',
  'defineModel',
  'getCurrentComponentContext',
  'isReactiveState',
  'unsafeHTML',
  'decodeEntities',
  'useTeleport',
]

const DIRECTIVE_IDENTIFIERS = ['when', 'each', 'match', 'anchorBlock']

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
    normalizedId.startsWith(srcDir + '/middleware/')
  // Files directly in srcDir root (e.g. app/loading.ts, app/error.ts)
  const isRootConventionFile =
    normalizedId.startsWith(srcDir + '/') &&
    !normalizedId.slice(srcDir.length + 1).includes('/')
  const isTargetDir = isSubDir || isRootConventionFile

  if (!isTargetDir) return null

  // Skip virtual modules and non-ts files
  if (id.startsWith('\0') || (!id.endsWith('.ts') && !id.endsWith('.js'))) return null

  const needsRuntime = isRuntimeImportNeeded(code)
  const needsDirectives = isDirectiveImportNeeded(code)
  const needsFramework = isFrameworkImportNeeded(code)
  const composableImport = buildComposableImport(code, opts.composableExports)

  if (!needsRuntime && !needsDirectives && !needsFramework && !composableImport) return null

  const ms = new MagicString(code)
  const injectLines: string[] = []

  if (needsRuntime) {
    injectLines.push(RUNTIME_IMPORTS)
  }

  if (needsDirectives) {
    injectLines.push(DIRECTIVE_IMPORTS)
  }

  if (needsFramework) {
    injectLines.push(FRAMEWORK_IMPORTS)
  }

  if (composableImport) {
    injectLines.push(composableImport)
  }

  ms.prepend(injectLines.join('\n') + '\n')

  return ms.toString()
}

/**
 * Checks if the file already imports runtime identifiers.
 * Returns true if injection is needed (not already imported).
 */
function isRuntimeImportNeeded(code: string): boolean {
  // If already importing from @jasonshimmy/custom-elements-runtime (not a sub-path), skip
  if (code.includes("from '@jasonshimmy/custom-elements-runtime'") ||
      code.includes('from "@jasonshimmy/custom-elements-runtime"')) {
    return false
  }

  // Check if any runtime identifiers are used in the file
  return RUNTIME_IDENTIFIERS.some((id) => {
    const pattern = new RegExp(`\\b${id}\\b`)
    return pattern.test(code)
  })
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

/**
 * Checks if the file already imports framework composables (useHead, etc.).
 * Returns true if injection is needed (not already imported).
 */
function isFrameworkImportNeeded(code: string): boolean {
  if (code.includes("from '@jasonshimmy/vite-plugin-cer-app/composables'") ||
      code.includes('from "@jasonshimmy/vite-plugin-cer-app/composables"')) {
    return false
  }

  return FRAMEWORK_IDENTIFIERS.some((id) => {
    const pattern = new RegExp(`\\b${id}\\b`)
    return pattern.test(code)
  })
}

/**
 * Checks if the file already imports directive identifiers.
 * Returns true if injection is needed (not already imported).
 */
function isDirectiveImportNeeded(code: string): boolean {
  // If already importing from directives sub-path, skip
  if (code.includes("from '@jasonshimmy/custom-elements-runtime/directives'") ||
      code.includes('from "@jasonshimmy/custom-elements-runtime/directives"')) {
    return false
  }

  // Check if any directive identifiers are used in the file
  return DIRECTIVE_IDENTIFIERS.some((id) => {
    const pattern = new RegExp(`\\b${id}\\b`)
    return pattern.test(code)
  })
}
