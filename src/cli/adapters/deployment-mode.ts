import { existsSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'pathe'
import { normalizeDocumentPath } from '../../runtime/request-dispatcher.js'

export function prerenderedPaths(distDir: string): string[] {
  const file = join(distDir, 'ssg-manifest.json')
  if (!existsSync(file)) return []
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as { paths?: string[] }
  return (manifest.paths ?? []).map(normalizeDocumentPath)
}

export function prerenderedFallback(distDir: string): boolean | undefined {
  const file = join(distDir, 'ssg-manifest.json')
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).fallback === true : undefined
}

export function copyPrerenderedDocuments(distDir: string, target: string): void {
  mkdirSync(target, { recursive: true })
  for (const path of prerenderedPaths(distDir)) {
    const file = path === '/' ? 'index.html' : path.slice(1) + '/index.html'
    mkdirSync(join(target, file, '..'), { recursive: true })
    copyFileSync(join(distDir, file), join(target, file))
  }
  if (existsSync(join(distDir, '404.html'))) copyFileSync(join(distDir, '404.html'), join(target, '404.html'))
}

/** Keep build-generated public metadata available in hybrid deployments. */
export function copyGeneratedPublicFiles(distDir: string, target: string): void {
  for (const file of ['sitemap.xml', 'robots.txt', 'form-dummy/index.html']) {
    if (!existsSync(join(distDir, file))) continue
    mkdirSync(join(target, file, '..'), { recursive: true })
    copyFileSync(join(distDir, file), join(target, file))
  }
}

export function nodeDispatcherSource(distDir: string, documentRoot: string): string {
  return `const dispatchRequest = app.createDispatchRequest ? app.createDispatchRequest({ prerendered: {
    paths: ${JSON.stringify(prerenderedPaths(distDir))},
    fallback: ${JSON.stringify(prerenderedFallback(distDir))},
    notFound: () => { try { return readFileSync(new URL(${JSON.stringify(documentRoot + '404.html')}, import.meta.url), 'utf8') } catch { return null } },
    read: (path) => readFileSync(new URL(${JSON.stringify(documentRoot)} + (path === '/' ? 'index.html' : path.slice(1).split('/').map(encodeURIComponent).join('/') + '/index.html'), import.meta.url), 'utf8'),
  } }) : app.dispatchRequest\n`
}

/** A retained server is optional for pure SSG, but required for hybrid/fallback. */
export function requiresServer(distDir: string): boolean {
  const manifestPath = join(distDir, 'ssg-manifest.json')
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf-8')) as { hybrid?: boolean; fallback?: boolean }
    : null
  const required = !manifest || !!(manifest.hybrid || manifest.fallback)
  const serverExists = existsSync(join(distDir, 'server/server.js'))
  if (manifest && required && !serverExists) throw new Error('[cer-app] Hybrid/fallback build is missing its server bundle. Rebuild before adapting.')
  return required && serverExists
}

export function isPublicBuildFile(distDir: string, path: string): boolean {
  const relative = path.slice(distDir.length + 1)
  return !['server', 'client', '.vite'].some((name) => relative === name || relative.startsWith(`${name}/`)) &&
    !/^(?:ssg-manifest|cer-client-manifest|cer-startup-manifest)\.json$/.test(relative)
}
