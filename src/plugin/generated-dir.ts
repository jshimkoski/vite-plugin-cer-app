import { writeFileSync, existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'pathe'
import type { ResolvedCerConfig } from './dev-server.js'
import { generateAppEntryTemplate } from '../runtime/app-template.js'
import { ENTRY_SERVER_TEMPLATE } from '../runtime/entry-server-template.js'

/** The name of the generated directory relative to the project root. */
export const GENERATED_DIR_NAME = '.cer'

/**
 * Returns the absolute path to the .cer/ generated directory.
 */
export function getGeneratedDir(root: string): string {
  return join(root, GENERATED_DIR_NAME)
}

/**
 * Returns the HTML entry path to use for builds.
 * Prefers the consumer's root-level `index.html` when it exists;
 * falls back to `.cer/index.html`.
 */
export function resolveHtmlEntry(config: ResolvedCerConfig): string {
  const userHtml = join(config.root, 'index.html')
  if (existsSync(userHtml)) return userHtml
  return join(getGeneratedDir(config.root), 'index.html')
}

/**
 * Generates the content for the default `.cer/index.html`.
 * Always points to the virtual `/@cer/app.ts` entry.
 */
export function generateDefaultHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CER App</title>
  </head>
  <body>
    <cer-layout-view></cer-layout-view>
    <script type="module" src="/@cer/app.ts"></script>
  </body>
</html>
`
}

const GITIGNORE_DEFAULTS = `# Dependencies
node_modules/

# Build output
dist/

# CER App generated directory
.cer/

# Environment variables
.env.local
.env.*.local

# Editor
.vscode/
.idea/
*.suo
*.sw?

# OS
.DS_Store
Thumbs.db

# Logs
*.log
`

/**
 * Ensures `.cer/`, `node_modules/`, `dist/`, and other common entries are
 * listed in the project's `.gitignore`. Creates `.gitignore` if it does not exist.
 */
function ensureGitignore(root: string): void {
  const gitignorePath = join(root, '.gitignore')
  const cerEntry = `${GENERATED_DIR_NAME}/`

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8')
    if (!content.includes(cerEntry) && !content.includes(`${GENERATED_DIR_NAME}\n`)) {
      appendFileSync(gitignorePath, `\n# CER App generated directory\n${cerEntry}\n`)
    }
  } else {
    writeFileSync(gitignorePath, GITIGNORE_DEFAULTS)
  }
}

/**
 * Writes all generated files to `.cer/`:
 * - `.cer/app.ts`        — framework entry (always regenerated)
 * - `.cer/index.html`    — default HTML shell (always regenerated)
 * - `.cer/tsconfig.json` — written by dts-generator via writeTsconfigPaths
 *
 * Also ensures `.cer/` is listed in `.gitignore`.
 */
export function writeGeneratedDir(config: ResolvedCerConfig): void {
  const dir = getGeneratedDir(config.root)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Always write the generated app.ts — this is the framework entry point and
  // is never user-owned. Regenerating it on every dev/build ensures consumers
  // automatically get the latest bootstrap code on plugin update (Nuxt-style).
  writeFileSync(join(dir, 'app.ts'), generateAppEntryTemplate(), 'utf-8')

  // Always write the SSR entry — used by the dev server's ssrLoadModule call.
  // The production build injects this as a virtual module, but the dev server
  // needs a real file on disk because ssrLoadModule resolves by file path.
  writeFileSync(join(dir, 'entry-server.ts'), ENTRY_SERVER_TEMPLATE, 'utf-8')

  // Always write the default index.html so builds and the dev server can use it.
  writeFileSync(join(dir, 'index.html'), generateDefaultHtml(), 'utf-8')

  ensureGitignore(config.root)
}
