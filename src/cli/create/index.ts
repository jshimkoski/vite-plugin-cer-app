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

export type AppMode = 'spa' | 'ssr' | 'ssg'

export interface CreateProjectOptions {
  projectName: string
  targetDir: string
  mode: AppMode
  material?: boolean
  content?: boolean
  tests?: boolean
}

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
 * Returns the path to the shared template directory (files common to all modes).
 */
function getSharedTemplateDir(): string {
  return join(__dirname, 'templates', 'shared')
}

/**
 * Returns the path to the mode-specific template directory.
 * Resolves relative to the compiled dist output.
 */
function getModeTemplateDir(mode: AppMode): string {
  // When running from compiled dist/, templates are in create/templates/
  // This file is at dist/cli/create/index.js, so templates are at dist/cli/create/templates/
  return join(__dirname, 'templates', mode)
}

async function readOwnVersion(): Promise<string> {
  const packagePath = join(__dirname, '../../../package.json')
  const pkg = JSON.parse(await readFile(packagePath, 'utf-8')) as { version?: string }
  if (!pkg.version) throw new Error(`Missing package version in ${packagePath}`)
  return pkg.version
}

async function addMaterialPreset(targetDir: string): Promise<void> {
  const packagePath = join(targetDir, 'package.json')
  const pkg = JSON.parse(await readFile(packagePath, 'utf-8')) as {
    dependencies: Record<string, string>
  }
  pkg.dependencies['@jasonshimmy/cer-material'] = '^0.7.2'
  pkg.dependencies['material-symbols'] = '^0.46.0'
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')

  const configPath = join(targetDir, 'cer.config.ts')
  const config = await readFile(configPath, 'utf-8')
  const withImport = config.replace(
    "import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'",
    "import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'\nimport { cerMaterial } from '@jasonshimmy/cer-material/vite'",
  )
  const configured = withImport.replace(/\n}\)\s*$/, '\n  integrations: [cerMaterial()],\n})\n')
  await writeFile(configPath, configured, 'utf-8')
}

async function addContentPreset(targetDir: string): Promise<void> {
  const pagesDir = join(targetDir, 'app/pages')
  const contentDir = join(targetDir, 'content')
  await mkdir(pagesDir, { recursive: true })
  await mkdir(contentDir, { recursive: true })
  await writeFile(join(pagesDir, '[...all].ts'), `component('page-content', () => {
  const props = useProps({ all: '' })
  const data = usePageData<ContentPageData>()
  const path = normalizeContentPath(props.all)
  const doc = data?.doc ?? null
  const breadcrumbs = useContentBreadcrumbs(path, doc, data?.existingPaths)

  useContentSeo({
    doc,
    path,
    siteUrl: useRuntimeConfig().public.siteUrl as string ?? 'http://localhost:3000',
    breadcrumbs,
  })

  return doc ? html\`
    <nav aria-label="Breadcrumb">
      \${breadcrumbs.map((crumb) => crumb.isLast
        ? html\`<span aria-current="page">\${crumb.label}</span>\`
        : crumb.hasPage
          ? html\`<a :href="\${crumb.path}">\${crumb.label}</a> / \`
          : html\`<span>\${crumb.label}</span> / \`)}
    </nav>
    <article>\${unsafeHTML(doc.body)}</article>
  \` : html\`<h1>Page not found</h1>\`
})

export const loader = defineContentPageLoader()
export const meta = { hydrate: 'none' as const }
`, 'utf-8')
  await writeFile(join(contentDir, 'getting-started.md'), `---
title: Getting Started
description: Build your first CER application.
---

# Getting Started

Add your Markdown content here. File paths become application routes automatically.

## Next steps

Edit \`app/layouts/default.ts\` to customize the surrounding application shell.
`, 'utf-8')
}

async function addTestsPreset(targetDir: string): Promise<void> {
  const packagePath = join(targetDir, 'package.json')
  const pkg = JSON.parse(await readFile(packagePath, 'utf-8')) as {
    scripts: Record<string, string>
    devDependencies: Record<string, string>
  }
  pkg.scripts['test:e2e'] = 'start-server-and-test preview http://127.0.0.1:4173 "cypress run"'
  pkg.scripts.validate += ' && npm run test:e2e'
  pkg.devDependencies.cypress = '^15.21.0'
  pkg.devDependencies['start-server-and-test'] = '^2.1.3'
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8')

  await mkdir(join(targetDir, 'cypress/e2e'), { recursive: true })
  await writeFile(join(targetDir, 'cypress.config.ts'), `import { defineConfig } from 'cypress'

export default defineConfig({
  video: false,
  e2e: {
    baseUrl: 'http://127.0.0.1:4173',
    includeShadowDom: true,
    supportFile: false,
  },
})
`, 'utf-8')
  await writeFile(join(targetDir, 'cypress/e2e/smoke.cy.ts'), `describe('generated application', () => {
  it('renders and navigates without a document reload', () => {
    cy.visit('/')
    cy.get('cer-layout-view').should('exist')
    cy.get('main').should('exist')
  })
})
`, 'utf-8')
}

/** Generate a project without prompting. Exported so every scaffold variant is testable. */
export async function createProject(options: CreateProjectOptions): Promise<void> {
  const sharedDir = getSharedTemplateDir()
  const modeDir = getModeTemplateDir(options.mode)
  if (!existsSync(sharedDir) || !existsSync(modeDir)) {
    throw new Error(`[create-cer-app] Template directory is missing: ${!existsSync(sharedDir) ? sharedDir : modeDir}`)
  }

  const files = new Map<string, string>()
  for (const [key, value] of await readTemplateFiles(sharedDir)) files.set(key, value)
  for (const [key, value] of await readTemplateFiles(modeDir)) files.set(key, value)
  await writeTemplateFiles(files, options.targetDir, {
    projectName: options.projectName,
    pluginVersion: await readOwnVersion(),
  })

  if (options.material) await addMaterialPreset(options.targetDir)
  if (options.content) await addContentPreset(options.targetDir)
  if (options.tests) await addTestsPreset(options.targetDir)
}

async function main(): Promise<void> {
  const program = new Command()

  program
    .name('create-cer-app')
    .description('Scaffold a new CER App project')
    .argument('[project-name]', 'Name of the project to create')
    .option('--mode <mode>', 'App mode: spa, ssr, or ssg')
    .option('--dir <dir>', 'Directory to create the project in (defaults to project name)')
    .option('--material', 'Add CER Material with automatic component imports and optimized symbols')
    .option('--content', 'Add a loader-backed Markdown content route')
    .option('--tests', 'Add a Cypress smoke suite')
    .action(async (projectNameArg?: string, options?: { mode?: string; dir?: string; material?: boolean; content?: boolean; tests?: boolean }) => {
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

      await createProject({
        projectName,
        targetDir,
        mode,
        material: options?.material,
        content: options?.content,
        tests: options?.tests,
      })

      console.log(`\nProject created! To get started:\n`)
      console.log(`  cd ${basename(targetDir)}`)
      console.log(`  npm install`)
      console.log(`  npm run dev\n`)
    })

  await program.parseAsync(process.argv)
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error('[create-cer-app] Fatal error:', err)
    process.exit(1)
  })
}
