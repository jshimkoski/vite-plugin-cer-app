import { Command } from 'commander'
import { resolve } from 'pathe'
import { runVercelAdapter } from '../adapters/vercel.js'
import { runNetlifyAdapter } from '../adapters/netlify.js'
import { runCloudflareAdapter } from '../adapters/cloudflare.js'

export function adaptCommand(): Command {
  return new Command('adapt')
    .description('Adapt the production build for a deployment platform')
    .requiredOption('--platform <platform>', 'Target platform: vercel, netlify, or cloudflare')
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
        default:
          console.error(
            `[cer-app] Unknown platform: "${options.platform}". Supported: vercel, netlify, cloudflare`,
          )
          process.exit(1)
      }
    })
}
