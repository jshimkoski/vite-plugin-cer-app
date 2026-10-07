import { Command } from 'commander'
import { createServer } from 'vite'
import { resolve } from 'pathe'
import { loadCerConfig } from '../config.js'
import { cerApp } from '../../plugin/index.js'

/**
 * Loads cer.config.ts from the current working directory.
 * Returns an empty object if no config file is found.
 */
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
      process.env.NODE_ENV = 'development'
      process.env.MODE = 'development'
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
