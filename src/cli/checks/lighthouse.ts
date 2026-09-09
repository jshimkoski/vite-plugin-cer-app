import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const LIGHTHOUSE_CATEGORIES = [
  'performance',
  'accessibility',
  'best-practices',
  'seo',
] as const

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export interface LighthouseAuditOptions {
  root?: string
  urls: string[]
  runs?: number
  attempts?: number
  preset?: 'desktop'
  categories?: string[]
  /** Chromium-family executable. Defaults to CHROME_PATH or a known platform installation. */
  chromePath?: string
}

export interface LighthouseUrlReport {
  url: string
  medians: Record<string, number>
}

export interface ChromiumDiscoveryOptions {
  environment?: Record<string, string | undefined>
  platform?: NodeJS.Platform
  exists?: (path: string) => boolean
}

/** Resolve Chrome, Chromium, Edge, or Brave without requiring a global Chrome install. */
export function findChromiumExecutable(options: ChromiumDiscoveryOptions = {}): string | undefined {
  const environment = options.environment ?? process.env
  const platform = options.platform ?? process.platform
  const exists = options.exists ?? existsSync
  const explicit = environment.CHROME_PATH?.trim()
  if (explicit) return explicit

  const candidates = platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      ]
    : platform === 'win32'
      ? [
          `${environment.PROGRAMFILES ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
          `${environment.PROGRAMFILES ?? 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`,
          `${environment.LOCALAPPDATA ?? ''}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/usr/bin/microsoft-edge',
          '/usr/bin/brave-browser',
        ]
  return candidates.find((candidate) => exists(candidate))
}

function run(command: string, args: string[], environment: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: environment })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

/** Run repeatable Lighthouse audits using the application's optional local dependency. */
export async function runLighthouseAudit(
  options: LighthouseAuditOptions,
): Promise<LighthouseUrlReport[]> {
  const root = resolve(options.root ?? process.cwd())
  const cli = join(root, 'node_modules/lighthouse/cli/index.js')
  const categories = options.categories ?? [...LIGHTHOUSE_CATEGORIES]
  const runs = Math.max(1, options.runs ?? 3)
  const attempts = Math.max(1, options.attempts ?? 3)
  const chromePath = options.chromePath?.trim() || findChromiumExecutable()
  const environment = chromePath ? { ...process.env, CHROME_PATH: chromePath } : process.env
  const reportsDir = await mkdtemp(join(tmpdir(), 'cer-lighthouse-'))
  const result: LighthouseUrlReport[] = []

  try {
    for (const [urlIndex, url] of options.urls.entries()) {
      const scores = Object.fromEntries(categories.map((category) => [category, [] as number[]]))
      for (let runIndex = 0; runIndex < runs; runIndex += 1) {
        const outputPath = join(reportsDir, `${urlIndex}-${runIndex}.json`)
        const args = [
          cli,
          url,
          '--quiet',
          '--chrome-flags=--headless --no-sandbox',
          `--only-categories=${categories.join(',')}`,
          '--output=json',
          `--output-path=${outputPath}`,
        ]
        if (options.preset) args.push(`--preset=${options.preset}`)

        let lastError: unknown
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          try {
            await run(process.execPath, args, environment)
            lastError = undefined
            break
          } catch (error) {
            lastError = error
            if (attempt < attempts) {
              await new Promise((resolveWait) => setTimeout(resolveWait, attempt * 250))
            }
          }
        }
        if (lastError) throw lastError

        const report = JSON.parse(await readFile(outputPath, 'utf8')) as {
          categories: Record<string, { score?: number }>
        }
        for (const category of categories) {
          scores[category].push(report.categories[category]?.score ?? 0)
        }
      }
      result.push({
        url,
        medians: Object.fromEntries(
          categories.map((category) => [category, median(scores[category])]),
        ),
      })
    }
    return result
  } finally {
    await rm(reportsDir, { recursive: true, force: true })
  }
}
