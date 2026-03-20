#!/usr/bin/env node
/**
 * create-cer-app scaffold CLI.
 * Usage: create-cer-app [project-name] [--mode spa|ssr|ssg]
 */
import { Command } from 'commander'
import { resolve, join, dirname, basename } from 'pathe'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

type AppMode = 'spa' | 'ssr' | 'ssg'

/**
 * Prompts the user for input on stdin.
 */
function prompt(question: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const displayQuestion = defaultValue
      ? `${question} (${defaultValue}): `
      : `${question}: `

    rl.question(displayQuestion, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue || '')
    })
  })
}

/**
 * Prompts the user to choose a mode from a list.
 */
async function promptMode(): Promise<AppMode> {
  console.log('Select app mode:')
  console.log('  1. spa  — Single-Page App (client-side rendering)')
  console.log('  2. ssr  — Server-Side Rendering')
  console.log('  3. ssg  — Static Site Generation')

  const answer = await prompt('Mode [1/2/3]', '1')

  const modeMap: Record<string, AppMode> = {
    '1': 'spa',
    '2': 'ssr',
    '3': 'ssg',
    spa: 'spa',
    ssr: 'ssr',
    ssg: 'ssg',
  }

  return modeMap[answer] ?? 'spa'
}

/**
 * Recursively reads all files from the template directory.
 */
async function readTemplateFiles(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>()

  async function walk(currentDir: string, prefix: string): Promise<void> {
    const entries = await readdir(currentDir)
    for (const entry of entries) {
      const fullPath = join(currentDir, entry)
      const relativePath = prefix ? `${prefix}/${entry}` : entry
      const info = await stat(fullPath)

      if (info.isDirectory()) {
        await walk(fullPath, relativePath)
      } else {
        const content = await readFile(fullPath, 'utf-8')
        // Strip .tpl extension from key
        const key = relativePath.endsWith('.tpl') ? relativePath.slice(0, -4) : relativePath
        files.set(key, content)
      }
    }
  }

  await walk(dir, '')
  return files
}

/**
 * Replaces template tokens in a content string.
 */
function applyTokens(content: string, tokens: Record<string, string>): string {
  let result = content
  for (const [key, value] of Object.entries(tokens)) {
    result = result.replaceAll(`{{${key}}}`, value)
  }
  return result
}

/**
 * Writes template files to the target directory.
 */
async function writeTemplateFiles(
  files: Map<string, string>,
  targetDir: string,
  tokens: Record<string, string>,
): Promise<void> {
  for (const [relativePath, rawContent] of files) {
    const content = applyTokens(rawContent, tokens)
    const outputPath = join(targetDir, relativePath)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, content, 'utf-8')
  }
}

/**
 * Returns the path to the template directory for the given mode.
 * Resolves relative to the compiled dist output.
 */
function getTemplateDir(mode: AppMode): string {
  // When running from compiled dist/, templates are in create/templates/
  // This file is at dist/cli/create/index.js, so templates are at dist/cli/create/templates/
  return join(__dirname, 'templates', mode)
}

async function main(): Promise<void> {
  const program = new Command()

  program
    .name('create-cer-app')
    .description('Scaffold a new CER App project')
    .argument('[project-name]', 'Name of the project to create')
    .option('--mode <mode>', 'App mode: spa, ssr, or ssg')
    .option('--dir <dir>', 'Directory to create the project in (defaults to project name)')
    .action(async (projectNameArg?: string, options?: { mode?: string; dir?: string }) => {
      console.log('\nWelcome to create-cer-app!\n')

      // Gather inputs
      const projectName = projectNameArg ?? (await prompt('Project name', 'my-cer-app'))
      const mode: AppMode = (options?.mode as AppMode | undefined) ?? (await promptMode())
      const targetDir = resolve(options?.dir ?? projectName)

      console.log(`\nCreating ${mode.toUpperCase()} project: ${projectName}`)
      console.log(`  Directory: ${targetDir}\n`)

      if (existsSync(targetDir)) {
        const overwrite = await prompt(`Directory "${targetDir}" already exists. Overwrite? [y/N]`, 'N')
        if (!overwrite.toLowerCase().startsWith('y')) {
          console.log('Aborted.')
          process.exit(0)
        }
      }

      // Load template files
      const templateDir = getTemplateDir(mode)

      if (!existsSync(templateDir)) {
        // Fallback: generate minimal template inline
        console.warn(`[create-cer-app] Template directory not found at ${templateDir}, using inline template.`)
        await generateInlineTemplate(targetDir, projectName, mode)
      } else {
        const files = await readTemplateFiles(templateDir)
        await writeTemplateFiles(files, targetDir, { projectName })
      }

      console.log(`\nProject created! To get started:\n`)
      console.log(`  cd ${basename(targetDir)}`)
      console.log(`  npm install`)
      console.log(`  npm run dev\n`)
    })

  await program.parseAsync(process.argv)
}

/**
 * Generates a minimal project structure inline when templates aren't available.
 */
async function generateInlineTemplate(
  targetDir: string,
  projectName: string,
  mode: AppMode,
): Promise<void> {
  await mkdir(join(targetDir, 'app/pages'), { recursive: true })
  await mkdir(join(targetDir, 'app/layouts'), { recursive: true })
  await mkdir(join(targetDir, 'app/components'), { recursive: true })
  await mkdir(join(targetDir, 'app/composables'), { recursive: true })
  await mkdir(join(targetDir, 'app/plugins'), { recursive: true })
  await mkdir(join(targetDir, 'app/middleware'), { recursive: true })

  // package.json
  await writeFile(
    join(targetDir, 'package.json'),
    JSON.stringify(
      {
        name: projectName,
        version: '0.1.0',
        type: 'module',
        scripts: {
          dev: 'cer-app dev',
          build: 'cer-app build',
          preview: 'cer-app preview',
        },
        dependencies: {
          '@jasonshimmy/custom-elements-runtime': '^3.1.1',
        },
        devDependencies: {
          vite: '^5.0.0',
          '@jasonshimmy/vite-plugin-cer-app': '^0.1.0',
          typescript: '^5.4.0',
        },
      },
      null,
      2,
    ),
    'utf-8',
  )

  // cer.config.ts
  await writeFile(
    join(targetDir, 'cer.config.ts'),
    `import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'\n\nexport default defineConfig({\n  mode: '${mode}',\n  autoImports: { components: true, composables: true, directives: true, runtime: true },\n})\n`,
    'utf-8',
  )

  // app/pages/index.ts
  await writeFile(
    join(targetDir, 'app/pages/index.ts'),
    `component('page-index', () => {\n  return html\`\n    <div>\n      <h1>Welcome to ${projectName}</h1>\n      <p>Edit <code>app/pages/index.ts</code> to get started.</p>\n    </div>\n  \`\n})\n`,
    'utf-8',
  )

  // app/layouts/default.ts
  await writeFile(
    join(targetDir, 'app/layouts/default.ts'),
    `component('layout-default', () => {\n  return html\`\n    <header><nav><router-link to="/">Home</router-link></nav></header>\n    <main><slot></slot></main>\n    <footer><p>Built with CER App</p></footer>\n  \`\n})\n`,
    'utf-8',
  )

  // .gitignore
  await writeFile(
    join(targetDir, '.gitignore'),
    `# Dependencies\nnode_modules/\n\n# Build output\ndist/\n\n# CER App generated directory\n.cer/\n\n# Environment variables\n.env.local\n.env.*.local\n\n# Editor\n.vscode/\n.idea/\n*.suo\n*.sw?\n\n# OS\n.DS_Store\nThumbs.db\n\n# Logs\n*.log\n`,
    'utf-8',
  )

  // index.html
  await writeFile(
    join(targetDir, 'index.html'),
    `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <cer-layout-view></cer-layout-view>\n    <script type="module" src="/.cer/app.ts"></script>\n  </body>\n</html>\n`,
    'utf-8',
  )
}

main().catch((err) => {
  console.error('[create-cer-app] Fatal error:', err)
  process.exit(1)
})
