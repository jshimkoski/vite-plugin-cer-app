#!/usr/bin/env node
import { Command } from 'commander'
import { devCommand } from './commands/dev.js'
import { buildCommand } from './commands/build.js'
import { previewCommand } from './commands/preview.js'
import { generateCommand } from './commands/generate.js'

const program = new Command()

program
  .name('cer-app')
  .description('Nuxt-style meta-framework CLI for @jasonshimmy/custom-elements-runtime')
  .version('0.1.0')

program.addCommand(devCommand())
program.addCommand(buildCommand())
program.addCommand(previewCommand())
program.addCommand(generateCommand())

program.parse(process.argv)
