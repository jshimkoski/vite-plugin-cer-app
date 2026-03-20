import { Command } from 'commander'
import { build } from 'vite'
import { resolve, join } from 'pathe'
import { pathToFileURL } from 'node:url'
import { existsSync, renameSync } from 'node:fs'
import { cerApp, resolveConfig } from '../../plugin/index.js'
import { buildSSR, resolveClientEntry } from '../../plugin/build-ssr.js'
import { buildSSG } from '../../plugin/build-ssg.js'
import { writeGeneratedDir } from '../../plugin/generated-dir.js'
import type { CerAppConfig } from '../../types/config.js'

async function loadCerConfig(root: string): Promise<CerAppConfig> {
  const configPath = resolve(root, 'cer.config.ts')
  const configPathJs = resolve(root, 'cer.config.js')

  const filePath = existsSync(configPath)
    ? configPath
    : existsSync(configPathJs)
      ? configPathJs
      : null

  if (!filePath) return {}

  try {
    const { build: viteBuild } = await import('vite')
    await viteBuild({
      build: {
        lib: {
          entry: filePath,
          formats: ['es'],
          fileName: 'cer.config',
        },
        outDir: resolve(root, 'node_modules/.cer-app-cache'),
        write: true,
        rollupOptions: { external: (id: string) => !id.startsWith('.') && !id.startsWith('/') },
      },
      logLevel: 'silent',
    })

    const outFile = resolve(root, 'node_modules/.cer-app-cache/cer.config.mjs')
    if (existsSync(outFile)) {
      const mod = await import(pathToFileURL(outFile).href + `?t=${Date.now()}`)
      return mod.default ?? {}
    }
  } catch {
    // ignore
  }

  try {
    const mod = await import(pathToFileURL(filePath).href + `?t=${Date.now()}`)
    return mod.default ?? {}
  } catch {
    return {}
  }
}

export function buildCommand(): Command {
  return new Command('build')
    .description('Build the application for production')
    .option('--root <root>', 'Project root directory', process.cwd())
    .option('--mode <mode>', 'Build mode: spa, ssr, or ssg (overrides cer.config.ts)')
    .action(async (options) => {
      const root = resolve(options.root)
      const userConfig = await loadCerConfig(root)

      // CLI --mode flag overrides config file
      if (options.mode) {
        userConfig.mode = options.mode as 'spa' | 'ssr' | 'ssg'
      }

      const config = resolveConfig(userConfig, root)

      console.log(`[cer-app] Building in ${config.mode} mode...`)

      switch (config.mode) {
        case 'spa': {
          // Write .cer/ files BEFORE resolveClientEntry checks for .cer/index.html.
          writeGeneratedDir(config)
          const spaEntry = resolveClientEntry(config)
          const spaOutDir = resolve(root, 'dist')
          await build({
            root,
            plugins: cerApp(userConfig),
            build: {
              outDir: spaOutDir,
              rollupOptions: { input: spaEntry },
            },
          })
          // If the entry was .cer/index.html, Vite outputs it as dist/.cer/index.html.
          // Rename it to dist/index.html so the preview server can find it.
          const generatedHtmlOut = join(spaOutDir, '.cer/index.html')
          const rootHtmlOut = join(spaOutDir, 'index.html')
          if (existsSync(generatedHtmlOut) && !existsSync(rootHtmlOut)) {
            renameSync(generatedHtmlOut, rootHtmlOut)
          }
          console.log('[cer-app] SPA build complete.')
          // Force exit: Vite HTML builds may keep Node timers alive.
          process.exit(0)
          break
        }

        case 'ssr': {
          const viteUserConfig = {
            root,
            plugins: cerApp(userConfig),
          }
          await buildSSR(config, viteUserConfig)
          break
        }

        case 'ssg': {
          const viteUserConfig = {
            root,
            plugins: cerApp(userConfig),
          }
          await buildSSG(config, viteUserConfig)
          // Force exit: the SSG path-enumeration Vite server may keep alive Node timers
          process.exit(0)
          break
        }

        default: {
          console.error(`[cer-app] Unknown mode: ${config.mode}`)
          process.exit(1)
        }
      }
    })
}
