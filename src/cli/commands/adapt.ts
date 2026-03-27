import { Command } from 'commander'
import { resolve } from 'pathe'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { runVercelAdapter } from '../adapters/vercel.js'
import { runNetlifyAdapter } from '../adapters/netlify.js'
import { runCloudflareAdapter } from '../adapters/cloudflare.js'
import type { CerAppConfig } from '../../types/config.js'

async function loadCustomAdapter(root: string): Promise<((root: string) => Promise<void>) | null> {
  const configPath = resolve(root, 'cer.config.ts')
  const configPathJs = resolve(root, 'cer.config.js')
  const filePath = existsSync(configPath) ? configPath : existsSync(configPathJs) ? configPathJs : null
  if (!filePath) return null

  try {
    const { build: viteBuild } = await import('vite')
    const cerDir = resolve(root, '.cer')
    const cerTsconfig = resolve(cerDir, 'tsconfig.json')
    if (!existsSync(cerTsconfig)) {
      mkdirSync(cerDir, { recursive: true })
      writeFileSync(cerTsconfig, '{"compilerOptions":{}}\n', 'utf-8')
    }
    await viteBuild({
      build: {
        lib: { entry: filePath, formats: ['es'], fileName: 'cer.config' },
        outDir: resolve(root, 'node_modules/.cer-app-cache'),
        write: true,
        rollupOptions: { external: (id: string) => !id.startsWith('.') && !id.startsWith('/') },
      },
      logLevel: 'silent',
    })
    const outFile = resolve(root, 'node_modules/.cer-app-cache/cer.config.mjs')
    if (existsSync(outFile)) {
      const mod = await import(pathToFileURL(outFile).href + `?t=${Date.now()}`)
      const cfg: CerAppConfig = mod.default ?? {}
      return typeof cfg.adapter === 'function' ? cfg.adapter : null
    }
  } catch {
    // ignore
  }
  return null
}

export function adaptCommand(): Command {
  return new Command('adapt')
    .description('Adapt the production build for a deployment platform')
    .requiredOption(
      '--platform <platform>',
      'Target platform: vercel, netlify, cloudflare, or custom (reads adapter function from cer.config.ts)',
    )
    .option('--root <root>', 'Project root directory', process.cwd())
    .action(async (options) => {
      const root = resolve(options.root)
      switch (options.platform) {
        case 'vercel':
          await runVercelAdapter(root)
          break
        case 'netlify':
          await runNetlifyAdapter(root)
          break
        case 'cloudflare':
          await runCloudflareAdapter(root)
          break
        case 'custom': {
          const fn = await loadCustomAdapter(root)
          if (!fn) {
            console.error(
              '[cer-app] No custom adapter function found in cer.config.ts. ' +
              'Set `adapter: async (root) => { ... }` in your config.',
            )
            process.exit(1)
          }
          await fn(root)
          break
        }
        default:
          console.error(
            `[cer-app] Unknown platform: "${options.platform}". Supported: vercel, netlify, cloudflare, custom`,
          )
          process.exit(1)
      }
    })
}
