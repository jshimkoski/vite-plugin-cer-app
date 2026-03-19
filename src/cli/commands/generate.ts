import { Command } from 'commander'
import { resolve } from 'pathe'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { resolveConfig } from '../../plugin/index.js'
import { buildSSG } from '../../plugin/build-ssg.js'
import { cerApp } from '../../plugin/index.js'
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
    const { build } = await import('vite')
    await build({
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

/**
 * `cer-app generate` — runs the full SSG build pipeline.
 * Alias for `cer-app build --mode ssg`.
 */
export function generateCommand(): Command {
  return new Command('generate')
    .description('Generate a static site (SSG build)')
    .option('--root <root>', 'Project root directory', process.cwd())
    .action(async (options) => {
      const root = resolve(options.root)
      const userConfig = await loadCerConfig(root)

      // Force SSG mode
      userConfig.mode = 'ssg'

      const config = resolveConfig(userConfig, root)

      console.log('[cer-app] Running SSG generation...')

      const viteUserConfig = {
        root,
        plugins: cerApp(userConfig),
      }

      await buildSSG(config, viteUserConfig)
      // Force exit: the SSG path-enumeration Vite server may keep alive Node timers.
      process.exit(0)
    })
}
