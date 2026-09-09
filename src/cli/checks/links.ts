import { access, readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

export interface BuiltLinksOptions {
  outputDir?: string
  skipTopLevel?: readonly string[]
}

export interface BuiltLinksReport {
  pages: number
  links: number
  failures: string[]
}

async function collectHtml(
  directory: string,
  skipped: ReadonlySet<string>,
  depth = 0,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (depth === 0 && entry.isDirectory() && skipped.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectHtml(path, skipped, depth + 1))
    else if (entry.name === 'index.html') files.push(path)
  }
  return files
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

async function isFile(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile() } catch { return false }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Validate every internal href and fragment emitted by an SSG build. */
export async function checkBuiltLinks(options: BuiltLinksOptions = {}): Promise<BuiltLinksReport> {
  const outputDir = resolve(options.outputDir ?? 'dist')
  const skipped = new Set(options.skipTopLevel ?? ['client', 'server', '_content', 'assets'])
  const pages = await collectHtml(outputDir, skipped)
  const failures: string[] = []
  let links = 0

  for (const page of pages) {
    const html = await readFile(page, 'utf8')
    const relativeDirectory = relative(outputDir, dirname(page)).split(sep).filter(Boolean).join('/')
    const pageRoute = relativeDirectory ? `/${relativeDirectory}` : '/'
    const base = new URL(pageRoute.endsWith('/') ? pageRoute : `${pageRoute}/`, 'https://local.test')
    const hrefs = [...html.matchAll(/\bhref=(?:"([^"]*)"|'([^']*)')/gi)]
      .map((match) => match[1] ?? match[2])

    for (const href of hrefs) {
      if (!href || /^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(href)) continue
      const url = new URL(href, base)
      if (url.origin !== base.origin) continue
      links += 1

      let pathname = url.pathname
      try { pathname = decodeURIComponent(pathname) } catch { /* retain encoded path */ }
      const relativeTarget = pathname.replace(/^\/+/, '')
      const directTarget = join(outputDir, relativeTarget)
      const routeTarget = pathname === '/'
        ? join(outputDir, 'index.html')
        : join(outputDir, relativeTarget, 'index.html')
      const target = await isFile(directTarget) ? directTarget : routeTarget

      if (!(await exists(target))) {
        failures.push(`${relative(outputDir, page)} -> ${href} (missing ${relative(outputDir, target)})`)
        continue
      }

      if (url.hash && target.endsWith('.html')) {
        let id = url.hash.slice(1)
        try { id = decodeURIComponent(id) } catch { /* retain encoded id */ }
        const targetHtml = target === page ? html : await readFile(target, 'utf8')
        const quotedId = escapeRegExp(id)
        const hasId = new RegExp(`\\bid=(?:"${quotedId}"|'${quotedId}')`, 'i').test(targetHtml)
        if (!hasId) failures.push(`${relative(outputDir, page)} -> ${href} (missing #${id})`)
      }
    }
  }

  return { pages: pages.length, links, failures }
}
