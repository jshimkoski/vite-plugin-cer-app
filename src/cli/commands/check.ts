import { Command } from 'commander'
import { resolve } from 'node:path'
import { checkBuiltLinks } from '../checks/links.js'
import { checkPerformanceBudgets } from '../checks/performance.js'
import { LIGHTHOUSE_CATEGORIES, runLighthouseAudit } from '../checks/lighthouse.js'

function numberOption(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid non-negative number: ${value}`)
  return parsed
}

function printFailures(label: string, failures: string[]): void {
  if (failures.length === 0) return
  console.error(`${label} failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
}

export function checkCommand(): Command {
  const command = new Command('check').description('Validate production build quality')

  command.addCommand(
    new Command('links')
      .description('Validate all internal SSG links and fragments')
      .option('--root <root>', 'Project root directory', process.cwd())
      .option('--output <directory>', 'Build output directory', 'dist')
      .action(async (options: { root: string; output: string }) => {
        const report = await checkBuiltLinks({ outputDir: resolve(options.root, options.output) })
        printFailures('Built-link validation', report.failures)
        if (report.failures.length === 0) {
          console.log(`Built-link validation passed: ${report.links} links across ${report.pages} pages.`)
        }
      }),
  )

  command.addCommand(
    new Command('performance')
      .description('Validate HTML and JavaScript production budgets')
      .option('--root <root>', 'Project root directory', process.cwd())
      .option('--output <directory>', 'Build output directory', 'dist')
      .option('--page <path>', 'Route to budget', '/')
      .option('--max-html <bytes>', 'Maximum HTML bytes', numberOption, 250_000)
      .option('--max-initial-js <bytes>', 'Maximum initial JavaScript gzip bytes', numberOption, 85_000)
      .option('--max-entry-js <bytes>', 'Maximum entry JavaScript gzip bytes', numberOption, 50_000)
      .option('--expected-pages <count>', 'Expected SSG manifest page count', numberOption)
      .action(async (options: {
        root: string
        output: string
        page: string
        maxHtml: number
        maxInitialJs: number
        maxEntryJs: number
        expectedPages?: number
      }) => {
        const report = await checkPerformanceBudgets({
          outputDir: resolve(options.root, options.output),
          page: options.page,
          maxHtmlBytes: options.maxHtml,
          maxInitialJsGzipBytes: options.maxInitialJs,
          maxEntryJsGzipBytes: options.maxEntryJs,
          expectedPages: options.expectedPages,
        })
        printFailures('Performance budget', report.failures)
        if (report.failures.length === 0) {
          console.log(`Performance budgets passed: HTML ${report.htmlBytes.toLocaleString()} bytes; initial JS ${report.initialJsGzipBytes.toLocaleString()} gzip bytes.`)
        }
      }),
  )

  command.addCommand(
    new Command('lighthouse')
      .description('Require perfect median Lighthouse scores using a local lighthouse dependency')
      .requiredOption('--url <urls...>', 'One or more preview URLs to audit')
      .option('--root <root>', 'Project root directory', process.cwd())
      .option('--runs <count>', 'Runs per URL', numberOption, 3)
      .option('--attempts <count>', 'Launch attempts per run', numberOption, 3)
      .option('--desktop', 'Use the Lighthouse desktop preset')
      .option('--chrome-path <path>', 'Chrome, Chromium, Edge, or Brave executable')
      .action(async (options: {
        url: string[]
        root: string
        runs: number
        attempts: number
        desktop?: boolean
        chromePath?: string
      }) => {
        const reports = await runLighthouseAudit({
          root: options.root,
          urls: options.url,
          runs: options.runs,
          attempts: options.attempts,
          preset: options.desktop ? 'desktop' : undefined,
          chromePath: options.chromePath,
        })
        const failures: string[] = []
        for (const report of reports) {
          const summary = LIGHTHOUSE_CATEGORIES.map((category) => {
            const score = report.medians[category] ?? 0
            if (score !== 1) failures.push(`${report.url}: ${category}=${Math.round(score * 100)}`)
            return `${category}=${Math.round(score * 100)}`
          })
          console.log(`[lighthouse] ${report.url}: ${summary.join(' ')}`)
        }
        printFailures('Lighthouse audit', failures)
      }),
  )

  return command
}
