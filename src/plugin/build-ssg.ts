import { writeFile, mkdir, readFile, cp, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'pathe'
import {
  injectFaviconLink,
  injectCanonicalLink,
  addNoopenerToExternalLinks,
  generateRobotsTxt,
  generateSitemapXml,
} from './html-post-process.js'
import { createServer, type UserConfig } from 'vite'
import type { ResolvedCerConfig } from './dev-server.js'
import type { ContentItem } from '../types/content.js'
import { buildSSR } from './build-ssr.js'
import { buildRouteEntry } from './path-utils.js'
import fg from 'fast-glob'

interface SsgManifest {
  generatedAt: string
  paths: string[]
  errors: Array<{ path: string; error: string }>
}

const CONTENT_STORE_KEY = '__CER_CONTENT_STORE__'

export type StylesheetLoader = (href: string) => Promise<string | null>

interface HtmlAttribute {
  name: string
  value: string | null
}

interface HtmlTagMatch {
  tag: string
  start: number
  end: number
}

const STYLE_ATTRIBUTES = new Set(['id', 'media', 'nonce', 'title', 'blocking'])

function findTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | null = null
  for (let index = start; index < html.length; index++) {
    const char = html[index]
    if (quote !== null) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      return index + 1
    }
  }
  return -1
}

function findLinkTags(html: string): HtmlTagMatch[] {
  const matches: HtmlTagMatch[] = []
  const lowerHtml = html.toLowerCase()
  const pattern = /<!--|<script\b|<style\b|<link\b/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    const token = match[0].toLowerCase()
    if (token === '<!--') {
      const commentEnd = html.indexOf('-->', pattern.lastIndex)
      if (commentEnd === -1) break
      pattern.lastIndex = commentEnd + 3
      continue
    }

    const end = findTagEnd(html, pattern.lastIndex)
    if (end === -1) break

    if (token === '<script' || token === '<style') {
      const tagName = token.slice(1)
      const closeStart = lowerHtml.indexOf(`</${tagName}`, end)
      if (closeStart === -1) break
      const closeEnd = findTagEnd(html, closeStart + tagName.length + 2)
      if (closeEnd === -1) break
      pattern.lastIndex = closeEnd
      continue
    }

    matches.push({ tag: html.slice(match.index, end), start: match.index, end })
    pattern.lastIndex = end
  }
  return matches
}

function parseHtmlAttributes(tag: string): HtmlAttribute[] {
  const source = tag.replace(/^<link\b/i, '').replace(/\/?\s*>$/, '')
  const attributes: HtmlAttribute[] = []
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    attributes.push({
      name: match[1],
      value: match[2] ?? match[3] ?? match[4] ?? null,
    })
  }
  return attributes
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function serializeStyleAttributes(attributes: HtmlAttribute[]): string {
  return attributes
    .filter(({ name }) => {
      const lowerName = name.toLowerCase()
      return STYLE_ATTRIBUTES.has(lowerName) || lowerName.startsWith('data-')
    })
    .filter(({ name }) => name.toLowerCase() !== 'data-cer-inline-source')
    .map(({ name, value }) => value === null
      ? ` ${name.toLowerCase()}`
      : ` ${name.toLowerCase()}="${escapeHtmlAttribute(value)}"`)
    .join('')
}

/**
 * Replaces eligible root-relative stylesheet links with inline style elements.
 * The loader is cached per href so a shared stylesheet is read only once per
 * document. Links are preserved when loading fails or the byte budget is
 * exceeded.
 *
 * @internal exported for unit testing
 */
export async function inlineStylesheetLinks(
  html: string,
  maxBytes: number,
  load: StylesheetLoader,
): Promise<string> {
  if (!(maxBytes > 0)) return html

  const matches = findLinkTags(html)
  if (matches.length === 0) return html

  const cache = new Map<string, Promise<string | null>>()
  const replacements = await Promise.all(matches.map(async (match) => {
    const tag = match.tag
    const attributes = parseHtmlAttributes(tag)
    const getValue = (name: string): string | null | undefined =>
      attributes.find((attribute) => attribute.name.toLowerCase() === name)?.value
    const relTokens = (getValue('rel') ?? '').toLowerCase().split(/\s+/)
    const href = getValue('href')

    if (
      !relTokens.includes('stylesheet') ||
      relTokens.includes('alternate') ||
      attributes.some(({ name }) => name.toLowerCase() === 'disabled') ||
      !href?.startsWith('/') ||
      href.startsWith('//')
    ) {
      return tag
    }

    let pending = cache.get(href)
    if (!pending) {
      pending = Promise.resolve(load(href)).catch(() => null)
      cache.set(href, pending)
    }
    const css = await pending
    if (css === null || new TextEncoder().encode(css).byteLength > maxBytes) return tag

    const safeCss = css.replace(/<\/style/gi, '<\\/style')
    const preservedAttributes = serializeStyleAttributes(attributes)
    return `<style${preservedAttributes} data-cer-inline-source="${escapeHtmlAttribute(href)}">${safeCss}</style>`
  }))

  let output = ''
  let cursor = 0
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]
    output += html.slice(cursor, match.start) + replacements[index]
    cursor = match.end
  }
  return output + html.slice(cursor)
}

/** @internal exported for unit testing */
export async function loadClientStylesheet(
  clientDist: string,
  href: string,
): Promise<string | null> {
  const pathname = href.split(/[?#]/, 1)[0]
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decodedPath.includes('\\') || decodedPath.split('/').includes('..')) return null

  const root = resolve(clientDist)
  const assetPath = resolve(root, `.${decodedPath}`)
  if (assetPath !== root && !assetPath.startsWith(`${root}/`)) return null

  try {
    return await readFile(assetPath, 'utf-8')
  } catch {
    return null
  }
}

/** Copy the client build output needed by root-level SSG pages. */
export async function copyClientPublicAssets(
  clientDist: string,
  distDir: string,
): Promise<void> {
  if (!existsSync(clientDist)) return
  const entries = await readdir(clientDist)
  await Promise.all(
    entries
      .filter((entry) => entry !== 'index.html' && !entry.startsWith('.'))
      .map((entry) => cp(
        join(clientDist, entry),
        join(distDir, entry),
        { recursive: true, force: true },
      )),
  )
}


/**
 * Collects all static paths to generate.
 * For 'auto' mode: scans app/pages/ and collects only static (non-dynamic) routes
 *   plus any dynamic routes that provide ssg.paths().
 * For explicit string[] mode: uses those paths directly.
 */
/**
 * Expands a set of base paths into locale-prefixed variants when i18n is
 * configured. Skips expansion for `no_prefix` strategy.
 */
function _expandWithLocales(
  paths: string[],
  i18n: ResolvedCerConfig['i18n'],
): string[] {
  if (!i18n || i18n.strategy === 'no_prefix') return paths
  const { locales, defaultLocale, strategy } = i18n
  const expanded: string[] = []
  for (const p of paths) {
    for (const locale of locales) {
      const isDefault = locale === defaultLocale
      if (isDefault && strategy === 'prefix_except_default') {
        expanded.push(p)
      } else {
        expanded.push(`/${locale}${p === '/' ? '' : p}`)
      }
    }
  }
  return [...new Set(expanded)]
}

async function collectSsgPaths(
  config: ResolvedCerConfig,
  viteUserConfig: UserConfig,
): Promise<string[]> {
  const ssgConfig = config.ssg

  if (Array.isArray(ssgConfig.routes) && ssgConfig.routes.length > 0) {
    return _expandWithLocales(ssgConfig.routes, config.i18n)
  }

  // Auto-discover paths
  const paths: string[] = ['/']

  if (!existsSync(config.pagesDir)) return paths

  const files = await fg('**/*.ts', {
    cwd: config.pagesDir,
    absolute: true,
    onlyFiles: true,
  })

  const staticFiles: string[] = []
  const dynamicFiles: Array<{
    file: string
    entry: ReturnType<typeof buildRouteEntry>
    usesQueryContent: boolean
  }> = []

  for (const file of files) {
    // Skip routes that declare render: 'server' or render: 'spa' — they are
    // either always-SSR or client-only and must not be pre-rendered.
    let src = ''
    try {
      src = await readFile(file, 'utf-8')
      const renderMatch = src.match(/render\s*:\s*['"]([^'"]+)['"]/)
      const renderMode = renderMatch ? renderMatch[1] : null
      if (renderMode === 'server' || renderMode === 'spa') continue
    } catch { /* ignore read errors */ }

    const entry = buildRouteEntry(file, config.pagesDir)
    // Reusable content-page loaders intentionally hide the queryContent call
    // from the route source. Treat either public API as an explicit signal that
    // a catch-all route can be enumerated from the built content store.
    const usesQueryContent = /\b(?:queryContent|defineContentPageLoader)\s*\(/.test(src)

    if (!entry.isDynamic && !entry.isCatchAll) {
      staticFiles.push(file)
      if (entry.routePath !== '/') {
        paths.push(entry.routePath)
      }
    } else if (entry.isDynamic) {
      dynamicFiles.push({ file, entry, usesQueryContent })
    }
  }

  if (dynamicFiles.length > 0) {
    // Use a Vite SSR dev server to load page modules with auto-imports applied
    const viteServer = await createServer({
      ...viteUserConfig,
      root: config.root,
      server: { middlewareMode: true },
      appType: 'custom',
      logLevel: 'silent',
    })

    try {
      for (const { file, entry, usesQueryContent } of dynamicFiles) {
        try {
          const pageMod = await viteServer.ssrLoadModule(file)
          const pageMeta = pageMod.meta ?? pageMod.pageMeta

          if (pageMeta?.render === 'server' || pageMeta?.render === 'spa') continue
          if (pageMeta?.ssg?.paths) {
            const pathsResult = await pageMeta.ssg.paths()
            for (const ctx of pathsResult) {
              let resolvedPath = entry.routePath
              for (const [key, value] of Object.entries(ctx.params as Record<string, unknown>)) {
                resolvedPath = resolvedPath.replace(`:${key}*`, String(value))
                resolvedPath = resolvedPath.replace(`:${key}`, String(value))
              }
              paths.push(resolvedPath)
            }
            continue
          }

          if (entry.isCatchAll && usesQueryContent) {
            const contentStore = (globalThis as Record<string, unknown>)[CONTENT_STORE_KEY] as ContentItem[] | undefined
            const catchAllPaths = _collectCatchAllContentPaths(entry.routePath, contentStore ?? [])
            paths.push(...catchAllPaths)
          }
        } catch {
          console.warn(`[cer-app] Could not enumerate paths for ${file}`)
        }
      }
    } finally {
      await viteServer.close()
    }
  }

  // When i18n is configured, expand every collected path into locale-prefixed
  // variants so each locale gets its own pre-rendered HTML file.
  //   strategy 'prefix'                → /en/about, /fr/about
  //   strategy 'prefix_except_default' → /about, /fr/about
  //   strategy 'no_prefix'             → no expansion (locale detected from header/cookie only)
  if (config.i18n && config.i18n.strategy !== 'no_prefix') {
    const { locales, defaultLocale, strategy } = config.i18n
    const expanded: string[] = []
    for (const p of paths) {
      for (const locale of locales) {
        const isDefault = locale === defaultLocale
        if (isDefault && strategy === 'prefix_except_default') {
          expanded.push(p)
        } else {
          expanded.push(`/${locale}${p === '/' ? '' : p}`)
        }
      }
    }
    return [...new Set(expanded)]
  }

  return [...new Set(paths)] // deduplicate
}

function _collectCatchAllContentPaths(routePath: string, store: ContentItem[]): string[] {
  if (store.length === 0) return []

  const prefix = routePath
    .replace(/:[^/]+\*$/, '')
    .replace(/\/+$/, '') || '/'

  return store
    .map((item) => item._path)
    .filter((contentPath) => {
      if (prefix === '/') return true
      return contentPath === prefix || contentPath.startsWith(prefix + '/')
    })
}

// Cache the server module across renderPath calls (loaded once per SSG run)
let _serverMod: Record<string, unknown> | null = null

/**
 * Renders a single path using the SSR server bundle and returns the HTML.
 *
 * The server bundle's handler already merges the SSR output with
 * dist/client/index.html internally (via the _mergeWithClientTemplate helper
 * it embeds at build time), so this function simply captures the response.
 */
async function renderPath(
  path: string,
  serverBundlePath: string,
): Promise<string> {
  // Load server bundle once
  if (!_serverMod) {
    try {
      _serverMod = await import(serverBundlePath) as Record<string, unknown>
    } catch (err) {
      throw new Error(`Failed to load server bundle at ${serverBundlePath}: ${err}`)
    }
  }

  const handlerFn =
    (typeof _serverMod['handler'] === 'function' ? _serverMod['handler'] : null) ??
    (typeof (_serverMod['default'] as Record<string, unknown> | undefined)?.['handler'] === 'function'
      ? (_serverMod['default'] as Record<string, unknown>)['handler']
      : null)

  if (typeof handlerFn !== 'function') {
    console.warn(`[cer-app] No handler function found in server bundle for path: ${path}`)
    return ''
  }

  // Mock req/res for the Express-style handler.
  // The handler internally merges with dist/client/index.html, so we just
  // capture whatever it writes/ends with.
  const mockReq = { url: path, headers: {} }
  return new Promise<string>((resolve, reject) => {
    const chunks: string[] = []
    const mockRes = {
      setHeader: () => {},
      write: (chunk: string) => { chunks.push(chunk) },
      end: (body?: string) => resolve(chunks.join('') + (body ?? '')),
    }
    ;(handlerFn as (req: unknown, res: unknown) => Promise<void>)(mockReq, mockRes).catch(reject)
  })
}

/**
 * Writes the rendered HTML to the output directory.
 * path '/' -> dist/index.html
 * path '/about' -> dist/about/index.html
 * @internal exported for unit testing
 */
export async function writeRenderedPath(
  path: string,
  html: string,
  distDir: string,
): Promise<void> {
  let outputPath: string
  if (path === '/') {
    outputPath = join(distDir, 'index.html')
  } else {
    // Normalize path and create directory
    const cleanPath = path.replace(/^\//, '').replace(/\/$/, '')
    outputPath = join(distDir, cleanPath, 'index.html')
  }

  await mkdir(join(outputPath, '..'), { recursive: true })
  await writeFile(outputPath, html, 'utf-8')
}

/**
 * Detects which favicon href to use from the project's public directory.
 * Prefers .svg > .ico > .png. Returns null when none is found.
 */
function detectFaviconHref(root: string): string | null {
  const candidates = ['/favicon.svg', '/favicon.ico', '/favicon.png']
  for (const href of candidates) {
    if (existsSync(join(root, 'public', href.slice(1)))) return href
  }
  return null
}

/**
 * Applies all HTML post-processing transforms to a rendered page.
 *
 * - Injects `<link rel="icon">` when a favicon exists in public/ and none
 *   is already declared in the HTML.
 * - Injects `<link rel="canonical">` when `config.siteUrl` is set and none
 *   is already declared.
 * - Adds `rel="noopener noreferrer"` to every `<a target="_blank">` link
 *   that is missing it.
 */
function postProcessHtml(
  html: string,
  path: string,
  config: ResolvedCerConfig,
  faviconHref: string | null,
): string {
  let out = html

  if (faviconHref) {
    out = injectFaviconLink(out, faviconHref)
  }

  if (config.siteUrl) {
    const canonicalUrl = config.siteUrl + (path === '/' ? '' : path)
    out = injectCanonicalLink(out, canonicalUrl)
  }

  out = addNoopenerToExternalLinks(out)

  return out
}

/**
 * Full SSG build pipeline:
 * 1. Run the SSR dual-build (client + server bundles)
 * 2. Copy platform files (_headers, _redirects, _routes.json) to dist/ root
 * 3. Enumerate all paths to generate
 * 4. Render each path using the server bundle
 * 5. Post-process HTML (favicon, canonical, noopener, optional CSS inlining)
 * 6. Write HTML files to dist/
 * 7. Write robots.txt (when not already present in public/)
 * 8. Write sitemap.xml (when siteUrl is set and not already present in public/)
 * 9. Write ssg-manifest.json
 */
export async function buildSSG(
  config: ResolvedCerConfig,
  viteUserConfig: UserConfig = {},
): Promise<void> {
  const distDir = join(config.root, 'dist')
  const serverDistDir = join(distDir, 'server')
  const serverBundlePath = join(serverDistDir, 'server.js')

  console.log('[cer-app] Starting SSG build...')

  // The deploy root is entirely generated output. Clear it up front so renamed
  // Vite chunks, deleted routes, and removed public files cannot survive from a
  // previous build and be deployed as stale or unexpectedly large artifacts.
  await rm(distDir, { recursive: true, force: true })
  _serverMod = null

  // Step 1: Run the SSR build to produce client + server bundles
  await buildSSR(config, viteUserConfig)

  // Step 2: Copy client assets and public-derived files from dist/client/ to
  // dist/ so root-level SSG pages are independently deployable. The generated
  // HTML references /assets/*; leaving those files only under dist/client/
  // produces broken production deployments even though the preview fallback
  // can mask the issue locally. The client HTML shell remains internal.
  const clientDist = join(distDir, 'client')
  await copyClientPublicAssets(clientDist, distDir)

  // Step 3: Collect paths to generate
  console.log('[cer-app] Collecting SSG paths...')
  const paths = await collectSsgPaths(config, viteUserConfig)
  console.log(`[cer-app] Found ${paths.length} path(s) to generate.`)
  if (paths.length <= 10) console.log(`[cer-app] Paths: ${paths.join(', ')}`)

  // Detect favicon once for use in every page's post-processing pass.
  const faviconHref = detectFaviconHref(config.root)

  // Step 4+5+6: Render, post-process, and write paths with bounded concurrency.
  // The server bundle uses per-request router instances (initRouter returns the
  // router; the factory passes it to createStreamingSSRHandler as { vnode, router })
  // so concurrent renders are safe — each request carries its own router with its
  // own URL state and never reads from the shared activeRouterProxy singleton.
  const concurrency = config.ssg?.concurrency ?? 4
  console.log(`[cer-app] Rendering ${paths.length} path(s) with concurrency ${concurrency}...`)

  const generatedPaths: string[] = []
  const errors: Array<{ path: string; error: string }> = []
  let lastProgressBucket = 0

  // Process paths in chunks of `concurrency` so we don't overwhelm the process
  // with hundreds of simultaneous renders on very large sites.
  for (let i = 0; i < paths.length; i += concurrency) {
    const chunk = paths.slice(i, i + concurrency)
    const results = await Promise.allSettled(
      chunk.map(async (path) => {
        if (paths.length <= 20) console.log(`[cer-app] Generating: ${path}`)
        const raw = await renderPath(path, serverBundlePath)
        let html = postProcessHtml(raw, path, config, faviconHref)
        if (config.ssg.inlineStylesheets !== false) {
          html = await inlineStylesheetLinks(
            html,
            config.ssg.inlineStylesheets,
            (href) => loadClientStylesheet(clientDist, href),
          )
        }
        await writeRenderedPath(path, html, distDir)
        return path
      }),
    )
    for (let j = 0; j < results.length; j++) {
      const result = results[j]
      if (result.status === 'fulfilled') {
        generatedPaths.push(result.value)
      } else {
        const errorMsg = String(result.reason)
        console.error(`[cer-app] Failed to generate ${chunk[j]}: ${errorMsg}`)
        errors.push({ path: chunk[j], error: errorMsg })
      }
    }
    if (paths.length > 20) {
      const completed = Math.min(i + chunk.length, paths.length)
      const progressBucket = Math.floor((completed * 10) / paths.length)
      if (progressBucket > lastProgressBucket || completed === paths.length) {
        lastProgressBucket = progressBucket
        console.log(`[cer-app] Rendered ${completed}/${paths.length} path(s).`)
      }
    }
  }

  // Step 7: Write robots.txt unless the project supplies its own via public/robots.txt,
  // which Vite copies to dist/ as-is. Always overwrite any previously generated file so
  // that siteUrl changes (e.g. adding the Sitemap directive) take effect on rebuild.
  const publicRobots = join(config.root, 'public', 'robots.txt')
  if (!existsSync(publicRobots)) {
    const distRobots = join(distDir, 'robots.txt')
    await mkdir(distDir, { recursive: true })
    await writeFile(distRobots, generateRobotsTxt(config.siteUrl), 'utf-8')
    console.log('[cer-app] Generated robots.txt')
  }

  // Step 8: Write sitemap.xml when siteUrl is set and no public/sitemap.xml exists.
  // Uses successfully-rendered paths only (errors are excluded). Do not emit a
  // fabricated build-date <lastmod>; it is only useful when tied to page changes.
  const publicSitemap = join(config.root, 'public', 'sitemap.xml')
  if (config.siteUrl && !existsSync(publicSitemap)) {
    const sitemapContent = generateSitemapXml(config.siteUrl, generatedPaths)
    await writeFile(join(distDir, 'sitemap.xml'), sitemapContent, 'utf-8')
    console.log('[cer-app] Generated sitemap.xml')
  }

  // Step 9: Write SSG manifest
  const manifest: SsgManifest = {
    generatedAt: new Date().toISOString(),
    paths: generatedPaths,
    errors,
  }

  const manifestPath = join(distDir, 'ssg-manifest.json')
  await mkdir(distDir, { recursive: true })
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

  console.log(`[cer-app] SSG build complete.`)
  console.log(`  Generated ${generatedPaths.length} page(s).`)
  if (errors.length > 0) {
    console.warn(`  ${errors.length} error(s) — see ${manifestPath} for details.`)
  }
  console.log(`  Manifest: ${manifestPath}`)

  if (errors.length > 0 && config.ssg.failOnError !== false) {
    throw new Error(
      `[cer-app] SSG failed to render ${errors.length} of ${paths.length} page(s). ` +
      `See ${manifestPath} for details.`,
    )
  }
}
