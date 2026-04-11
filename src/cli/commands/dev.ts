import { Command } from 'commander'
import { createServer } from 'vite'
import { resolve } from 'pathe'
import { pathToFileURL } from 'node:url'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { cerApp } from '../../plugin/index.js'
import type { CerAppConfig } from '../../types/config.js'

/**
 * Loads cer.config.ts from the current working directory.
 * Returns an empty object if no config file is found.
 */
async function loadCerConfig(root: string): Promise<CerAppConfig> {
  const configPath = resolve(root, 'cer.config.ts')
  const configPathJs = resolve(root, 'cer.config.js')

  const filePath = existsSync(configPath)
    ? configPath
    : existsSync(configPathJs)
      ? configPathJs
      : null

  if (!filePath) {
    console.warn('[cer-app] No cer.config.ts found; using defaults.')
    return {}
  }

  try {
    // Bootstrap .cer/tsconfig.json so rolldown can resolve it during cer.config.ts transform
    const cerDir = resolve(root, '.cer')
    const cerTsconfig = resolve(cerDir, 'tsconfig.json')
    if (!existsSync(cerTsconfig)) {
      mkdirSync(cerDir, { recursive: true })
      writeFileSync(cerTsconfig, '{"compilerOptions":{}}\n', 'utf-8')
    }

    // Use Vite's build to transpile TS config at runtime
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
        rollupOptions: {
          // Externalize all bare package imports (handles file: symlinks too)
          external: (id: string) => !id.startsWith('.') && !id.startsWith('/'),
        },
      },
      logLevel: 'silent',
    })

    const outFile = resolve(root, 'node_modules/.cer-app-cache/cer.config.mjs')
    if (existsSync(outFile)) {
      const mod = await import(pathToFileURL(outFile).href + `?t=${Date.now()}`)
      return mod.default ?? {}
    }
  } catch (err) {
    console.warn('[cer-app] Could not load cer.config.ts via build, trying dynamic import:', err)
  }

  // Fallback: try direct import (works for .js configs)
  try {
    const mod = await import(pathToFileURL(filePath).href + `?t=${Date.now()}`)
    return mod.default ?? {}
  } catch {
    return {}
  }
}

export function devCommand(): Command {
  return new Command('dev')
    .description('Start the development server')
    .option('-p, --port <port>', 'Port to listen on', '3000')
    .option('--host <host>', 'Host to bind to', 'localhost')
    .option('--root <root>', 'Project root directory', process.cwd())
    .option('--mode <mode>', 'Dev mode: spa, ssr, or ssg (overrides cer.config.ts)')
    .action(async (options) => {
      const root = resolve(options.root)
      const userConfig = await loadCerConfig(root)
      // CLI --mode flag overrides config file (mirrors build command behaviour)
      if (options.mode) {
        userConfig.mode = options.mode as 'spa' | 'ssr' | 'ssg'
      }
      const port = options.port ? parseInt(options.port, 10) : (userConfig.port ?? 3000)

      console.log('[cer-app] Starting dev server...')

      const server = await createServer({
        root,
        server: {
          port,
          host: options.host,
        },
        plugins: cerApp(userConfig),
      })

      await server.listen()
      server.printUrls()

      // Handle graceful shutdown
      process.on('SIGTERM', async () => {
        await server.close()
        process.exit(0)
      })
      process.on('SIGINT', async () => {
        await server.close()
        process.exit(0)
      })
    })
}
