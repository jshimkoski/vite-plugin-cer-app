import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'pathe'
import { createServer, build, type UserConfig } from 'vite'
import type { ResolvedCerConfig } from './dev-server.js'
import { buildSSR } from './build-ssr.js'
import { buildRouteEntry } from './path-utils.js'
import fg from 'fast-glob'

interface SsgManifest {
  generatedAt: string
  paths: string[]
  errors: Array<{ path: string; error: string }>
}


/**
 * Collects all static paths to generate.
 * For 'auto' mode: scans app/pages/ and collects only static (non-dynamic) routes
 *   plus any dynamic routes that provide ssg.paths().
 * For explicit string[] mode: uses those paths directly.
 */
async function collectSsgPaths(
  config: ResolvedCerConfig,
  viteUserConfig: UserConfig,
): Promise<string[]> {
  const ssgConfig = config.ssg

  if (Array.isArray(ssgConfig.routes) && ssgConfig.routes.length > 0) {
    return ssgConfig.routes
  }

  // Auto-discover paths
  const paths: string[] = ['/']

  if (!existsSync(config.pagesDir)) return paths

  const files = await fg('**/*.ts', {
    cwd: config.pagesDir,
    absolute: true,
    onlyFiles: true,
  })

  const staticFiles: string[] = []
  const dynamicFiles: Array<{ file: string; entry: ReturnType<typeof buildRouteEntry> }> = []

  for (const file of files) {
    const entry = buildRouteEntry(file, config.pagesDir)

    if (!entry.isDynamic && !entry.isCatchAll) {
      staticFiles.push(file)
      if (entry.routePath !== '/') {
        paths.push(entry.routePath)
      }
    } else if (entry.isDynamic && !entry.isCatchAll) {
      dynamicFiles.push({ file, entry })
    }
  }

  if (dynamicFiles.length > 0) {
    // Use a Vite SSR dev server to load page modules with auto-imports applied
    const viteServer = await createServer({
      ...viteUserConfig,
      root: config.root,
      server: { middlewareMode: true },
      appType: 'custom',
      logLevel: 'silent',
    })

    try {
      for (const { file, entry } of dynamicFiles) {
        try {
          const pageMod = await viteServer.ssrLoadModule(file)
          const pageMeta = pageMod.meta ?? pageMod.pageMeta

          if (pageMeta?.ssg?.paths) {
            const pathsResult = await pageMeta.ssg.paths()
            for (const ctx of pathsResult) {
              let resolvedPath = entry.routePath
              for (const [key, value] of Object.entries(ctx.params as Record<string, unknown>)) {
                resolvedPath = resolvedPath.replace(`:${key}`, String(value))
              }
              paths.push(resolvedPath)
            }
          }
        } catch {
          console.warn(`[cer-app] Could not enumerate paths for ${file}`)
        }
      }
    } finally {
      await viteServer.close()
    }
  }

  return [...new Set(paths)] // deduplicate
}

// Cache the server module across renderPath calls (loaded once per SSG run)
let _serverMod: Record<string, unknown> | null = null

/**
 * Renders a single path using the SSR server bundle and returns the HTML.
 *
 * The server bundle's handler already merges the SSR output with
 * dist/client/index.html internally (via the _mergeWithClientTemplate helper
 * it embeds at build time), so this function simply captures the response.
 */
async function renderPath(
  path: string,
  serverBundlePath: string,
): Promise<string> {
  // Load server bundle once
  if (!_serverMod) {
    try {
      _serverMod = await import(serverBundlePath) as Record<string, unknown>
    } catch (err) {
      throw new Error(`Failed to load server bundle at ${serverBundlePath}: ${err}`)
    }
  }

  const handlerFn =
    (typeof _serverMod['handler'] === 'function' ? _serverMod['handler'] : null) ??
    (typeof (_serverMod['default'] as Record<string, unknown> | undefined)?.['handler'] === 'function'
      ? (_serverMod['default'] as Record<string, unknown>)['handler']
      : null)

  if (typeof handlerFn !== 'function') {
    console.warn(`[cer-app] No handler function found in server bundle for path: ${path}`)
    return ''
  }

  // Mock req/res for the Express-style handler.
  // The handler internally merges with dist/client/index.html, so we just
  // capture whatever it ends with.
  const mockReq = { url: path, headers: {} }
  return new Promise<string>((resolve, reject) => {
    const mockRes = {
      setHeader: () => {},
      end: (body: string) => resolve(body),
    }
    ;(handlerFn as Function)(mockReq, mockRes).catch(reject)
  })
}

/**
 * Writes the rendered HTML to the output directory.
 * path '/' -> dist/index.html
 * path '/about' -> dist/about/index.html
 * @internal exported for unit testing
 */
export async function writeRenderedPath(
  path: string,
  html: string,
  distDir: string,
): Promise<void> {
  let outputPath: string
  if (path === '/') {
    outputPath = join(distDir, 'index.html')
  } else {
    // Normalize path and create directory
    const cleanPath = path.replace(/^\//, '').replace(/\/$/, '')
    outputPath = join(distDir, cleanPath, 'index.html')
  }

  await mkdir(join(outputPath, '..'), { recursive: true })
  await writeFile(outputPath, html, 'utf-8')
}

/**
 * Full SSG build pipeline:
 * 1. Run the SSR dual-build (client + server bundles)
 * 2. Enumerate all paths to generate
 * 3. Render each path using the server bundle
 * 4. Write HTML files to dist/
 * 5. Write ssg-manifest.json
 */
export async function buildSSG(
  config: ResolvedCerConfig,
  viteUserConfig: UserConfig = {},
): Promise<void> {
  const distDir = join(config.root, 'dist')
  const serverDistDir = join(distDir, 'server')
  const serverBundlePath = join(serverDistDir, 'server.js')

  console.log('[cer-app] Starting SSG build...')

  // Step 1: Run the SSR build to produce client + server bundles
  await buildSSR(config, viteUserConfig)

  // Step 2: Collect paths to generate
  console.log('[cer-app] Collecting SSG paths...')
  const paths = await collectSsgPaths(config, viteUserConfig)
  console.log(`[cer-app] Found ${paths.length} path(s) to generate:`, paths)

  // Step 3+4: Render and write paths with bounded concurrency.
  // The server bundle uses per-request router instances (initRouter returns the
  // router; the factory passes it to createStreamingSSRHandler as { vnode, router })
  // so concurrent renders are safe — each request carries its own router with its
  // own URL state and never reads from the shared activeRouterProxy singleton.
  const concurrency = config.ssg?.concurrency ?? 4
  console.log(`[cer-app] Rendering ${paths.length} path(s) with concurrency ${concurrency}...`)

  const generatedPaths: string[] = []
  const errors: Array<{ path: string; error: string }> = []

  // Process paths in chunks of `concurrency` so we don't overwhelm the process
  // with hundreds of simultaneous renders on very large sites.
  for (let i = 0; i < paths.length; i += concurrency) {
    const chunk = paths.slice(i, i + concurrency)
    const results = await Promise.allSettled(
      chunk.map(async (path) => {
        console.log(`[cer-app] Generating: ${path}`)
        const html = await renderPath(path, serverBundlePath)
        await writeRenderedPath(path, html, distDir)
        return path
      }),
    )
    for (let j = 0; j < results.length; j++) {
      const result = results[j]
      if (result.status === 'fulfilled') {
        generatedPaths.push(result.value)
      } else {
        const errorMsg = String(result.reason)
        console.error(`[cer-app] Failed to generate ${chunk[j]}: ${errorMsg}`)
        errors.push({ path: chunk[j], error: errorMsg })
      }
    }
  }

  // Step 5: Write SSG manifest
  const manifest: SsgManifest = {
    generatedAt: new Date().toISOString(),
    paths: generatedPaths,
    errors,
  }

  const manifestPath = join(distDir, 'ssg-manifest.json')
  await mkdir(distDir, { recursive: true })
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

  console.log(`[cer-app] SSG build complete.`)
  console.log(`  Generated ${generatedPaths.length} page(s).`)
  if (errors.length > 0) {
    console.warn(`  ${errors.length} error(s) — see ${manifestPath} for details.`)
  }
  console.log(`  Manifest: ${manifestPath}`)
}
