import { resolve, join } from 'pathe'
import { existsSync, readFileSync } from 'node:fs'
import type { Plugin, ViteDevServer } from 'vite'
import type { CerAppConfig } from '../types/config.js'
import type { ResolvedCerConfig } from './dev-server.js'
import { cerPlugin } from '@jasonshimmy/custom-elements-runtime/vite-plugin'
import { autoImportTransform } from './transforms/auto-import.js'
import { scanComposableExports, writeAutoImportDts, writeTsconfigPaths } from './dts-generator.js'
import { configureCerDevServer } from './dev-server.js'
import { writeGeneratedDir, getGeneratedDir } from './generated-dir.js'
import { APP_ENTRY_TEMPLATE } from '../runtime/app-template.js'
import { generateRoutesCode } from './virtual/routes.js'
import { generateLayoutsCode } from './virtual/layouts.js'
import { generateComponentsCode } from './virtual/components.js'
import { generateComposablesCode } from './virtual/composables.js'
import { generatePluginsCode } from './virtual/plugins.js'
import { generateMiddlewareCode } from './virtual/middleware.js'
import { generateServerApiCode } from './virtual/server-api.js'
import { generateServerMiddlewareCode } from './virtual/server-middleware.js'
import { generateLoadingCode } from './virtual/loading.js'
import { generateErrorCode } from './virtual/error.js'
import { createWatcher } from './scanner.js'

// Virtual module IDs (raw)
const VIRTUAL_IDS = {
  routes: 'virtual:cer-routes',
  layouts: 'virtual:cer-layouts',
  components: 'virtual:cer-components',
  composables: 'virtual:cer-composables',
  plugins: 'virtual:cer-plugins',
  middleware: 'virtual:cer-middleware',
  serverApi: 'virtual:cer-server-api',
  serverMiddleware: 'virtual:cer-server-middleware',
  appConfig: 'virtual:cer-app-config',
  loading: 'virtual:cer-loading',
  error: 'virtual:cer-error',
} as const

// Resolved virtual module IDs (prefixed with \0)
const RESOLVED_IDS = Object.fromEntries(
  Object.entries(VIRTUAL_IDS).map(([k, v]) => [k, `\0${v}`]),
) as Record<keyof typeof VIRTUAL_IDS, string>

// The app entry is served via a virtual module at /@cer/app.ts.
// Using /@ avoids Vite's dot-directory fs security restriction that blocks /.cer/
// from being served through the transform middleware. The physical .cer/app.ts
// is still written to disk for IDE/TypeScript support, but the browser fetches
// /@cer/app.ts which resolves to this virtual module.
const APP_ENTRY_URL = '/@cer/app.ts'
const RESOLVED_APP_ENTRY = '\0cer-app-entry'

/**
 * Fills in default values for all config fields and resolves absolute paths.
 */
export function resolveConfig(userConfig: CerAppConfig, root: string = process.cwd()): ResolvedCerConfig {
  const mode = userConfig.mode ?? 'spa'
  const srcDir = resolve(root, userConfig.srcDir ?? 'app')

  return {
    mode,
    srcDir,
    root,
    pagesDir: join(srcDir, 'pages'),
    layoutsDir: join(srcDir, 'layouts'),
    componentsDir: join(srcDir, 'components'),
    composablesDir: join(srcDir, 'composables'),
    pluginsDir: join(srcDir, 'plugins'),
    middlewareDir: join(srcDir, 'middleware'),
    serverApiDir: join(root, 'server/api'),
    serverMiddlewareDir: join(root, 'server/middleware'),
    port: userConfig.port ?? 3000,
    ssg: {
      routes: userConfig.ssg?.routes ?? 'auto',
      concurrency: userConfig.ssg?.concurrency ?? 4,
      fallback: userConfig.ssg?.fallback ?? false,
    },
    router: {
      base: userConfig.router?.base,
      scrollToFragment: userConfig.router?.scrollToFragment,
    },
    jitCss: {
      content: userConfig.jitCss?.content ?? [
        `${srcDir}/pages/**/*.ts`,
        `${srcDir}/components/**/*.ts`,
        `${srcDir}/layouts/**/*.ts`,
      ],
      extendedColors: userConfig.jitCss?.extendedColors ?? false,
    },
    autoImports: {
      components: userConfig.autoImports?.components ?? true,
      composables: userConfig.autoImports?.composables ?? true,
      directives: userConfig.autoImports?.directives ?? true,
      runtime: userConfig.autoImports?.runtime ?? true,
    },
    runtimeConfig: {
      public: userConfig.runtimeConfig?.public ?? {},
      private: userConfig.runtimeConfig?.private ?? {},
    },
    auth: userConfig.auth ?? null,
  }
}

/**
 * Maps a resolved virtual ID to the appropriate generator function.
 */
async function generateVirtualModule(
  id: string,
  config: ResolvedCerConfig,
  ssr = false,
): Promise<string | null> {
  switch (id) {
    case RESOLVED_IDS.routes:
      return generateRoutesCode(config.pagesDir)
    case RESOLVED_IDS.layouts:
      return generateLayoutsCode(config.layoutsDir)
    case RESOLVED_IDS.components:
      return generateComponentsCode(config.componentsDir)
    case RESOLVED_IDS.composables:
      return generateComposablesCode(config.composablesDir)
    case RESOLVED_IDS.plugins:
      return generatePluginsCode(config.pluginsDir)
    case RESOLVED_IDS.middleware:
      return generateMiddlewareCode(config.middlewareDir)
    case RESOLVED_IDS.serverApi:
      return generateServerApiCode(config.serverApiDir, config.auth)
    case RESOLVED_IDS.serverMiddleware:
      return generateServerMiddlewareCode(config.serverMiddlewareDir)
    case RESOLVED_IDS.appConfig:
      return generateAppConfigModule(config, ssr)
    case RESOLVED_IDS.loading:
      return generateLoadingCode(config.srcDir)
    case RESOLVED_IDS.error:
      return generateErrorCode(config.srcDir)
    default:
      return null
  }
}

/**
 * Generates a virtual module that exports the resolved app config.
 * When `ssr` is true, also exports `_runtimePrivateDefaults` (server-only).
 * The client bundle never receives private keys.
 */
function generateAppConfigModule(config: ResolvedCerConfig, ssr = false): string {
  const exportedConfig = {
    mode: config.mode,
    router: config.router,
    ssg: config.ssg,
  }
  const publicConfig = config.runtimeConfig.public
  let code =
    `// AUTO-GENERATED by @jasonshimmy/vite-plugin-cer-app\n` +
    `export const appConfig = ${JSON.stringify(exportedConfig, null, 2)}\n` +
    `export default appConfig\n` +
    `\n` +
    `export const runtimeConfig = { public: ${JSON.stringify(publicConfig, null, 2)} }\n`

  if (ssr) {
    const privateDefaults = config.runtimeConfig.private
    code += `\nexport const _runtimePrivateDefaults = ${JSON.stringify(privateDefaults, null, 2)}\n`
    // Expose the auth session key so the entry-server template can pre-resolve
    // the authenticated user without duplicating config knowledge.
    const authSessionKey = config.auth?.sessionKey ?? (config.auth ? 'auth' : null)
    code += `\nexport const _authSessionKey = ${JSON.stringify(authSessionKey)}\n`
  }

  return code
}

/**
 * Determines which virtual module IDs should be invalidated when a file changes
 * in a given directory.
 */
function getDirtyVirtualIds(filePath: string, config: ResolvedCerConfig): string[] {
  const dirty: string[] = []

  if (filePath.startsWith(config.pagesDir)) {
    dirty.push(RESOLVED_IDS.routes)
  }
  if (filePath.startsWith(config.layoutsDir)) {
    dirty.push(RESOLVED_IDS.layouts)
  }
  if (filePath.startsWith(config.componentsDir)) {
    dirty.push(RESOLVED_IDS.components)
  }
  if (filePath.startsWith(config.composablesDir)) {
    dirty.push(RESOLVED_IDS.composables)
  }
  if (filePath.startsWith(config.pluginsDir)) {
    dirty.push(RESOLVED_IDS.plugins)
  }
  if (filePath.startsWith(config.middlewareDir)) {
    dirty.push(RESOLVED_IDS.middleware)
  }
  if (filePath.startsWith(config.serverApiDir)) {
    dirty.push(RESOLVED_IDS.serverApi)
  }
  if (filePath.startsWith(config.serverMiddlewareDir)) {
    dirty.push(RESOLVED_IDS.serverMiddleware)
  }

  return dirty
}

/**
 * The main cerApp() Vite plugin factory.
 * Returns an array of plugins: the cer-app orchestrator + the runtime JIT CSS plugin(s).
 */
export function cerApp(userConfig: CerAppConfig = {}): Plugin[] {
  let config: ResolvedCerConfig
  let composableExports = new Map<string, string>()

  // Cache for generated virtual module code (invalidated on file changes)
  const moduleCache = new Map<string, string>()

  const cerAppPlugin: Plugin = {
    name: '@jasonshimmy/vite-plugin-cer-app',

    config(viteConfig) {
      const root = viteConfig.root ? resolve(viteConfig.root) : process.cwd()
      config = resolveConfig(userConfig, root)
      return {
        build: {
          target: 'esnext',
          rollupOptions: {
            onwarn(warning, warn) {
              // loader and meta are optional exports from page files — suppress noise
              if (
                warning.code === 'MISSING_EXPORT' &&
                (warning.binding === 'loader' || warning.binding === 'meta')
              ) {
                return
              }
              warn(warning)
            },
          },
        },
      }
    },

    configResolved(resolvedConfig) {
      // Re-resolve with the final root
      config = resolveConfig(userConfig, resolvedConfig.root)
      // Write .cer/ immediately after config is resolved so the physical
      // app.ts exists for IDE/TypeScript support before any Vite hooks fire.
      writeGeneratedDir(config)
    },

    transformIndexHtml(html: string) {
      // Rewrite any existing /.cer/app.ts src reference (older projects or
      // the scaffold template) to /@cer/app.ts so Vite's transform middleware
      // processes it. Vite blocks /.* paths from the transform pipeline.
      return html.replace(/src=["']\/\.cer\/app\.ts["']/g, 'src="/@cer/app.ts"')
    },

    resolveId(id: string) {
      if (id === APP_ENTRY_URL) return RESOLVED_APP_ENTRY
      if ((Object.values(VIRTUAL_IDS) as string[]).includes(id)) {
        return `\0${id}`
      }
    },

    async load(id: string, options?: { ssr?: boolean }) {
      if (id === RESOLVED_APP_ENTRY) return APP_ENTRY_TEMPLATE

      const allResolved = Object.values(RESOLVED_IDS) as string[]
      if (!allResolved.includes(id)) return null

      const ssr = options?.ssr ?? false
      // For virtual:cer-app-config the SSR and client variants differ (private
      // defaults are only included in the SSR bundle), so use separate cache keys.
      const cacheKey = id === RESOLVED_IDS.appConfig ? `${id}:${ssr ? 'ssr' : 'client'}` : id

      // Return from cache if available
      if (moduleCache.has(cacheKey)) {
        return moduleCache.get(cacheKey)!
      }

      // Generate and cache
      const code = await generateVirtualModule(id, config, ssr)
      if (code !== null) {
        moduleCache.set(cacheKey, code)
        return code
      }

      return null
    },

    transform(code: string, id: string) {
      if (!config) return null
      if (config.autoImports?.runtime === false) return null
      // Skip virtual modules
      if (id.startsWith('\0')) return null

      const result = autoImportTransform(code, id, {
        srcDir: config.srcDir,
        serverMiddlewareDir: config.serverMiddlewareDir,
        composableExports: config.autoImports?.composables !== false ? composableExports : undefined,
      })
      if (result === null) return null
      return { code: result, map: null }
    },

    async configureServer(server: ViteDevServer) {
      if (!config) {
        // config might not be set yet; resolve with cwd
        config = resolveConfig(userConfig, process.cwd())
      }

      // Write .cer/ generated files (app.ts fallback, index.html, .gitignore)
      writeGeneratedDir(config)

      // Scan composables and write .d.ts + tsconfig paths on dev server start
      composableExports = await scanComposableExports(config.composablesDir)
      await writeAutoImportDts(config.root, config.composablesDir, composableExports)
      writeTsconfigPaths(config.root, config.srcDir)

      // Serve a generated index.html for HTML requests when the consumer has
      // not provided one. This runs BEFORE configureCerDevServer so that the
      // Vite HTML pipeline (HMR injection, module preprocessing) is applied.
      const userHtml = resolve(config.root, 'index.html')
      if (!existsSync(userHtml)) {
        const cerHtmlPath = join(getGeneratedDir(config.root), 'index.html')
        server.middlewares.use(async (req, res, next) => {
          const url = (req as { url?: string }).url ?? '/'
          const isHtmlRequest =
            url === '/' ||
            url === '/index.html' ||
            (!url.includes('.') && !url.startsWith('/api/'))
          if (isHtmlRequest && existsSync(cerHtmlPath)) {
            const rawHtml = readFileSync(cerHtmlPath, 'utf-8')
            const transformed = await server.transformIndexHtml(url, rawHtml)
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(transformed)
            return
          }
          next()
        })
      }

      // Watch app/ and server/ directories for file changes
      const watchDirs = [
        config.pagesDir,
        config.layoutsDir,
        config.componentsDir,
        config.composablesDir,
        config.pluginsDir,
        config.middlewareDir,
        config.serverApiDir,
        config.serverMiddlewareDir,
      ]

      createWatcher(server.watcher, watchDirs, async (event, file) => {
        if (event === 'add' || event === 'unlink') {
          // Re-scan composables and regenerate .d.ts if a composable changed
          if (file.startsWith(config.composablesDir)) {
            composableExports = await scanComposableExports(config.composablesDir)
            await writeAutoImportDts(config.root, config.composablesDir, composableExports)
          }
          // Invalidate relevant virtual modules
          const dirtyIds = getDirtyVirtualIds(file, config)
          for (const resolvedId of dirtyIds) {
            moduleCache.delete(resolvedId)
            const mod = server.moduleGraph.getModuleById(resolvedId)
            if (mod) {
              server.moduleGraph.invalidateModule(mod)
            }
          }
          // Trigger HMR
          server.ws.send({ type: 'full-reload' })
        }
      })

      // Register dev server middleware for API routes + SSR
      configureCerDevServer(server, config)
    },

    async buildStart() {
      if (!config) {
        config = resolveConfig(userConfig, process.cwd())
      }
      // Write .cer/ generated files before the build begins
      writeGeneratedDir(config)
      // Scan composables and generate type declarations + tsconfig paths
      composableExports = await scanComposableExports(config.composablesDir)
      await writeAutoImportDts(config.root, config.composablesDir, composableExports)
      writeTsconfigPaths(config.root, config.srcDir)
      // Warm the virtual module cache.
      // virtual:cer-app-config is cached under separate :client/:ssr keys (SSR
      // build omits _runtimePrivateDefaults from the client variant), so use the
      // correct key suffix here so load() hits the cache instead of regenerating.
      for (const resolvedId of Object.values(RESOLVED_IDS)) {
        const code = await generateVirtualModule(resolvedId, config)
        if (code !== null) {
          const cacheKey = resolvedId === RESOLVED_IDS.appConfig
            ? `${resolvedId}:client`
            : resolvedId
          moduleCache.set(cacheKey, code)
        }
      }
    },
  }

  // Include cerPlugin from the runtime for JIT CSS support
  // Resolve config eagerly so cerPlugin can use the final resolved values
  const resolvedForJit = resolveConfig(userConfig)
  const { content, ...jitOptions } = resolvedForJit.jitCss
  const jitPlugins = cerPlugin({
    content,
    ...jitOptions,
    ssr: {
      dsd: true,
      jit: jitOptions,
    },
  })

  return [cerAppPlugin, ...jitPlugins]
}
