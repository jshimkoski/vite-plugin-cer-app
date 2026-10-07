import { gzipSync } from 'node:zlib'
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

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
  /** Bytes requested through modulepreload, independent of execution timing. */
  preloadedJsGzipBytes: number
  startupAssets: string[]
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

  const localAsset = (url: string, importer = outputDir): string | null => {
    if (/^(?:[a-z]+:)?\/\//i.test(url)) return null
    const name = url.split(/[?#]/)[0]
    const path = name.startsWith('/') ? resolve(outputDir, `.${name}`) : resolve(importer, name)
    return path.startsWith(outputDir + '/') && /\.m?js$/.test(path) ? path : null
  }
  const preloadRoots = [...html.matchAll(/<link\b[^>]*rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/g)].map((m) => m[1])
  const entryRoots = [
    ...[...html.matchAll(/<script\b[^>]*src=["']([^"']+\.m?js(?:[?#][^"']*)?)["']/g)].map((m) => m[1]),
    // CER's first-paint bootstrap is an inline import, even when preloads are disabled.
    ...[...html.matchAll(/\bimport\(\s*["']([^"']+\.m?js)["']\s*\)/g)].map((m) => m[1]),
  ]
  type ManifestEntry = { file: string; imports?: string[] }
  let manifest: Record<string, ManifestEntry> = {}
  for (const file of ['cer-client-manifest.json', '.vite/manifest.json', 'client/.vite/manifest.json']) {
    try { manifest = JSON.parse(await readFile(join(outputDir, file), 'utf8')); break } catch { /* older builds */ }
  }
  const byFile = new Map(Object.values(manifest).map((entry) => [resolve(outputDir, entry.file), entry]))
  const sizes = new Map<string, number>()
  async function graph(roots: string[]): Promise<Set<string>> {
    const visited = new Set<string>()
    async function visit(path: string | null): Promise<void> {
      if (!path || visited.has(path)) return
      visited.add(path)
      try {
        const source = await readFile(path, 'utf8')
        sizes.set(path, gzipSync(source).byteLength)
        const entry = byFile.get(path)
        const dependencies = entry
          ? (entry.imports ?? []).map((key) => manifest[key]?.file).filter((file): file is string => !!file).map((file) => localAsset('/' + file))
          : [...source.matchAll(/(?:\b(?:import|export)\s*(?:[^;"']*?\sfrom\s*)?)["']([^"']+)["']/g)].map((m) => localAsset(m[1], dirname(path)))
        await Promise.all(dependencies.map(visit))
      } catch {
        failures.push(`${options.page ?? '/'} references missing JavaScript asset ${path.slice(outputDir.length + 1)}`)
      }
    }
    await Promise.all(roots.map((url) => visit(localAsset(url))))
    return visited
  }
  let startupRoots: string[] = []
  try {
    const startup = JSON.parse(await readFile(join(outputDir, 'cer-startup-manifest.json'), 'utf8')) as Record<string, string[]>
    startupRoots = (startup[page ? '/' + page : '/'] ?? []).map((file) => '/' + file)
  } catch { /* Older builds do not emit a content startup manifest. */ }
  const startup = await graph([...entryRoots, ...preloadRoots, ...startupRoots])
  const preloaded = await graph(preloadRoots)
  const sum = (paths: Iterable<string>) => [...paths].reduce((total, path) => total + (sizes.get(path) ?? 0), 0)
  const initialJsGzipBytes = sum(startup)
  const preloadedJsGzipBytes = sum(preloaded)
  const entryJsGzipBytes = sum(new Set(entryRoots.map((url) => localAsset(url)).filter((path): path is string => !!path)))

  if (options.maxHtmlBytes !== undefined && htmlBytes > options.maxHtmlBytes) {
    failures.push(`${options.page ?? '/'} is ${htmlBytes.toLocaleString()} bytes (budget: ${options.maxHtmlBytes.toLocaleString()})`)
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

  return { htmlBytes, initialJsGzipBytes, entryJsGzipBytes, preloadedJsGzipBytes, startupAssets: [...startup].map((path) => path.slice(outputDir.length + 1)).sort(), failures }
}
