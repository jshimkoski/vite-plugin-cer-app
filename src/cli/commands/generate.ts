import { Command } from 'commander'
import { buildCommand } from './build.js'

/** Generation uses the same adapters and validation as an SSG build. */
export function generateCommand(): Command {
  return new Command('generate')
    .description('Generate a static site (alias for build --mode ssg)')
    .option('--root <root>', 'Project root directory', process.cwd())
    .action(async (options) => {
      await buildCommand().parseAsync(['--root', options.root, '--mode', 'ssg'], { from: 'user' })
    })
}
