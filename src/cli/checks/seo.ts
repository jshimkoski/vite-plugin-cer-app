import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** General SSG invariants; content/provider assertions stay with the application. */
export async function checkSeo(options: { outputDir?: string; siteUrl: string }): Promise<{ pages: number; failures: string[] }> {
  const root = resolve(options.outputDir ?? 'dist'), failures: string[] = []
  const manifest = JSON.parse(await readFile(join(root, 'ssg-manifest.json'), 'utf8')) as { paths: string[] }
  const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8')
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replace(/&amp;/g, '&'))
  if (new Set(locations).size !== locations.length) failures.push('Sitemap has duplicate URLs')
  const expected = new Set<string>()
  for (const path of manifest.paths) {
    const html = await readFile(join(root, path === '/' ? 'index.html' : `${path.slice(1)}/index.html`), 'utf8')
    const canonical = options.siteUrl.replace(/\/$/, '') + (path === '/' ? '' : path)
    const links = [...html.matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/gi)]
    if (links.length !== 1 || links[0]?.[1] !== canonical) failures.push(`${path}: expected one canonical ${canonical}`)
    const noindex = /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*\bnoindex\b/i.test(html)
    if (!noindex) expected.add(canonical)
    if (/<p>\s*<(?:document-list|modeler-section)\b/i.test(html)) failures.push(`${path}: block component nested in paragraph`)
  }
  for (const url of expected) if (!locations.includes(url)) failures.push(`Sitemap missing ${url}`)
  for (const url of locations) if (!expected.has(url)) failures.push(`Sitemap includes nonindexable or unknown URL ${url}`)
  try {
    const html = await readFile(join(root, '404.html'), 'utf8')
    if (!/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*\bnoindex\b/i.test(html)) failures.push('404 document must be noindex')
    if (/<link\b[^>]*rel=["']canonical["']/i.test(html)) failures.push('404 document must omit canonical')
  } catch { /* Vite/CER can provide a default noindex 404 at preview time. */ }
  return { pages: manifest.paths.length, failures }
}
