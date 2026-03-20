import { writeFileSync, existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'pathe'
import type { ResolvedCerConfig } from './dev-server.js'
import { APP_ENTRY_TEMPLATE } from '../runtime/app-template.js'

/** The name of the generated directory relative to the project root. */
export const GENERATED_DIR_NAME = '.cer'

/**
 * Returns the absolute path to the .cer/ generated directory.
 */
export function getGeneratedDir(root: string): string {
  return join(root, GENERATED_DIR_NAME)
}

/**
 * Returns the app entry file path to use for builds and the dev server.
 * Prefers the consumer's `app/app.ts` when it exists; falls back to `.cer/app.ts`.
 */
export function resolveAppEntry(config: ResolvedCerConfig): string {
  const userEntry = join(config.srcDir, 'app.ts')
  if (existsSync(userEntry)) return userEntry
  return join(getGeneratedDir(config.root), 'app.ts')
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
 * Generates the content for a default `index.html`.
 * The script src points to the consumer's `app/app.ts` if it exists,
 * otherwise to the generated `.cer/app.ts`.
 */
export function generateDefaultHtml(config: ResolvedCerConfig): string {
  const userEntry = join(config.srcDir, 'app.ts')
  const scriptSrc = existsSync(userEntry) ? '/app/app.ts' : '/.cer/app.ts'
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CER App</title>
  </head>
  <body>
    <cer-layout-view></cer-layout-view>
    <script type="module" src="${scriptSrc}"></script>
  </body>
</html>
`
}

/**
 * Ensures `.cer/` is listed in the project's `.gitignore`.
 * Creates `.gitignore` if it does not exist.
 */
function ensureGitignore(root: string): void {
  const gitignorePath = join(root, '.gitignore')
  const entry = `${GENERATED_DIR_NAME}/`

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8')
    if (!content.includes(entry) && !content.includes(`${GENERATED_DIR_NAME}\n`)) {
      appendFileSync(gitignorePath, `\n# CER App generated directory\n${entry}\n`)
    }
  } else {
    writeFileSync(gitignorePath, `# CER App generated directory\n${entry}\n`)
  }
}

/**
 * Writes all generated files to `.cer/`:
 * - `.cer/app.ts`       — default entry (only when `app/app.ts` does not exist)
 * - `.cer/index.html`   — default HTML shell
 * - `.cer/tsconfig.json` — written by dts-generator via writeTsconfigPaths
 *
 * Also ensures `.cer/` is listed in `.gitignore`.
 */
export function writeGeneratedDir(config: ResolvedCerConfig): void {
  const dir = getGeneratedDir(config.root)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Write default app.ts only when the consumer has not provided one.
  const userEntry = join(config.srcDir, 'app.ts')
  if (!existsSync(userEntry)) {
    writeFileSync(join(dir, 'app.ts'), APP_ENTRY_TEMPLATE, 'utf-8')
  }

  // Always write the default index.html so builds and the dev server can use it.
  writeFileSync(join(dir, 'index.html'), generateDefaultHtml(config), 'utf-8')

  ensureGitignore(config.root)
}
