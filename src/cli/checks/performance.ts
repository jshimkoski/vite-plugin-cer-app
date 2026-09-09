import { gzipSync } from 'node:zlib'
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

export interface PerformanceBudgetOptions {
  outputDir?: string
  page?: string
  maxHtmlBytes?: number
  maxInitialJsGzipBytes?: number
  maxEntryJsGzipBytes?: number
  expectedPages?: number
}

export interface PerformanceBudgetReport {
  htmlBytes: number
  initialJsGzipBytes: number
  entryJsGzipBytes: number
  failures: string[]
}

/** Measure framework-neutral SSG output budgets and build-integrity signals. */
export async function checkPerformanceBudgets(
  options: PerformanceBudgetOptions = {},
): Promise<PerformanceBudgetReport> {
  const outputDir = resolve(options.outputDir ?? 'dist')
  const page = (options.page ?? '/').replace(/^\/+|\/+$/g, '')
  const htmlPath = page ? join(outputDir, page, 'index.html') : join(outputDir, 'index.html')
  const assetsDir = join(outputDir, 'assets')
  const html = await readFile(htmlPath, 'utf8')
  const htmlBytes = (await stat(htmlPath)).size
  const failures: string[] = []

  const assetNames = new Set(
    [...html.matchAll(/(?:src|href)=(?:"([^"]+\.js)"|'([^']+\.js)')/g)]
      .map((match) => match[1] ?? match[2])
      .map((url) => url.slice(url.lastIndexOf('/') + 1)),
  )
  let initialJsGzipBytes = 0
  let entryJsGzipBytes = 0
  for (const name of assetNames) {
    try {
      const bytes = gzipSync(await readFile(join(assetsDir, name))).byteLength
      initialJsGzipBytes += bytes
      if (name.startsWith('index-')) entryJsGzipBytes += bytes
    } catch {
      failures.push(`homepage references missing JavaScript asset ${name}`)
    }
  }

  if (options.maxHtmlBytes !== undefined && htmlBytes > options.maxHtmlBytes) {
    failures.push(`homepage is ${htmlBytes.toLocaleString()} bytes (budget: ${options.maxHtmlBytes.toLocaleString()})`)
  }
  if (
    options.maxInitialJsGzipBytes !== undefined &&
    initialJsGzipBytes > options.maxInitialJsGzipBytes
  ) {
    failures.push(`initial JavaScript is ${initialJsGzipBytes.toLocaleString()} gzip bytes (budget: ${options.maxInitialJsGzipBytes.toLocaleString()})`)
  }
  if (
    options.maxEntryJsGzipBytes !== undefined &&
    entryJsGzipBytes > options.maxEntryJsGzipBytes
  ) {
    failures.push(`entry JavaScript is ${entryJsGzipBytes.toLocaleString()} gzip bytes (budget: ${options.maxEntryJsGzipBytes.toLocaleString()})`)
  }

  const assets = await readdir(assetsDir)
  const browserExternals = assets.filter((name) => name.startsWith('__vite-browser-external'))
  if (browserExternals.length > 0) {
    failures.push(`client build contains browser-external shims: ${browserExternals.join(', ')}`)
  }

  try {
    const manifest = JSON.parse(await readFile(join(outputDir, 'ssg-manifest.json'), 'utf8')) as {
      paths?: unknown[]
      errors?: unknown[]
    }
    if ((manifest.errors?.length ?? 0) > 0) {
      failures.push(`SSG manifest contains ${manifest.errors!.length} render error(s)`)
    }
    if (options.expectedPages !== undefined && manifest.paths?.length !== options.expectedPages) {
      failures.push(`SSG manifest contains ${manifest.paths?.length ?? 0} pages (expected: ${options.expectedPages})`)
    }
  } catch {
    if (options.expectedPages !== undefined) {
      failures.push(`missing ${basename(join(outputDir, 'ssg-manifest.json'))}`)
    }
  }

  return { htmlBytes, initialJsGzipBytes, entryJsGzipBytes, failures }
}
