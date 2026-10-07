import { Command } from 'commander'
import { preview, type PreviewServer, type PreviewOptions, type Plugin } from 'vite'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'pathe'
import { pathToFileURL } from 'node:url'
import { loadCerConfig } from '../config.js'
import { createRequestDispatcher, normalizeDocumentPath, isPrivateBuildPath, type ServerApplication } from '../../runtime/request-dispatcher.js'
import { isPathBounded } from './preview-paths.js'

const connections = new WeakMap<PreviewServer, Set<import('node:net').Socket>>()

export async function closePreview(server: PreviewServer): Promise<void> {
  for (const socket of connections.get(server) ?? []) socket.destroy()
  await new Promise<void>((done) => server.httpServer.close(() => done()))
}

export interface CerPreviewOptions {
  root?: string
  port?: number
  host?: string
  ssr?: boolean
  preview?: PreviewOptions
}

/** Vite owns transport, compression, media types and range requests. CER owns routing. */
export async function startPreview(options: CerPreviewOptions = {}): Promise<PreviewServer> {
  const root = resolve(options.root ?? process.cwd())
  const distDir = join(root, 'dist')
  if (!existsSync(distDir)) throw new Error(`No dist/ directory at ${distDir}. Run cer-app build first.`)
  const manifestPath = join(distDir, 'ssg-manifest.json')
  const ssg = existsSync(manifestPath)
  const manifest = ssg ? JSON.parse(readFileSync(manifestPath, 'utf8')) : undefined
  const paths = new Set<string>(manifest?.paths ?? [])
  const bundle = join(distDir, 'server/server.js')
  const useSSR = options.ssr || (existsSync(bundle) && (!ssg || manifest?.fallback || manifest?.hybrid))
  let app: ServerApplication | undefined
  if (useSSR) {
    if (!existsSync(bundle)) throw new Error(`Missing server bundle ${bundle}`)
    process.env.__CER_APP_ROOT__ = root
    app = await import(pathToFileURL(bundle).href)
    if (typeof app?.handler !== 'function') throw new Error('Server bundle does not export handler')
  }
  const dispatch = app ? createRequestDispatcher(app, { prerendered: {
    paths: [...paths],
    fallback: ssg ? manifest?.fallback === true : undefined,
    notFound: () => existsSync(join(distDir, '404.html')) ? readFileSync(join(distDir, '404.html'), 'utf8') : null,
    read: (path) => readFileSync(join(distDir, path === '/' ? 'index.html' : path.slice(1) + '/index.html'), 'utf8'),
  } }) : undefined
  const plugin: Plugin = {
    name: 'cer-preview-routing',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        for (const [name, value] of Object.entries({
          'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin', ...options.preview?.headers,
        })) res.setHeader(name, value)
        res.setHeader('Cache-Control', req.url?.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
        const raw = (req.url ?? '/').split('?')[0]
        let path: string
        try { path = normalizeDocumentPath(raw) } catch { res.statusCode = 400; res.end('Bad Request'); return }
        if (!isPathBounded(distDir, path) || path.includes('\\')) { res.statusCode = 400; res.end('Bad Request'); return }
        const normalized = path.replace(/\/+$/, '') || '/'
        if (isPrivateBuildPath(normalized)) {
          res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); res.end('Not found'); return
        }
        // Existing public files retain Vite's transport (including range requests).
        // All other requests are documents or API routes, even when they contain dots.
        const publicFile = join(distDir, app && !ssg ? 'client' : '', path)
        if (dispatch && (normalized.startsWith('/api/') || paths.has(normalized) || !existsSync(publicFile) || !statSync(publicFile).isFile())) {
          void Promise.resolve(dispatch(req, res)).catch(next)
          return
        }
        if (ssg && paths.has(normalized)) req.url = normalized === '/' ? '/index.html' : normalized + '/index.html'
        next()
      })
      return () => {
        server.middlewares.use((req, res, next) => {
          if (!ssg || res.headersSent) { next(); return }
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          const notFound = join(distDir, '404.html')
          const html = existsSync(notFound) ? readFileSync(notFound) : '<!doctype html><meta name="robots" content="noindex"><title>Not found</title><h1>Not found</h1>'
          res.end(req.method === 'HEAD' ? undefined : html)
        })
      }
    },
  }
  const server = await preview({
    root, configFile: false, appType: ssg || app ? 'mpa' : 'spa', plugins: [plugin],
    build: { outDir: app && !ssg ? join(distDir, 'client') : distDir },
    preview: {
      ...options.preview, host: options.host ?? options.preview?.host ?? 'localhost',
      // Vite's default CORS middleware adds Vary: Origin to every document,
      // which correctly bypasses shared ISR. Enable CORS only when requested.
      cors: options.preview?.cors ?? false,
      port: options.port ?? options.preview?.port ?? 4173, strictPort: options.preview?.strictPort ?? true,
      headers: {
        'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin', ...options.preview?.headers,
      },
    },
  })
  const sockets = new Set<import('node:net').Socket>()
  connections.set(server, sockets)
  server.httpServer.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  if ('headersTimeout' in server.httpServer) server.httpServer.headersTimeout = 10_000
  if ('requestTimeout' in server.httpServer) server.httpServer.requestTimeout = 30_000
  return server
}

export function previewCommand(): Command {
  return new Command('preview')
    .description('Preview the production build with Vite and CER routing')
    .option('-p, --port <port>', 'Port to listen on')
    .option('--host <host>', 'Host to bind to')
    .option('--root <root>', 'Project root directory', process.cwd())
    .option('--ssr', 'Serve using SSR handler from dist/server/server.js')
    .action(async (options) => {
      const config = await loadCerConfig(resolve(options.root))
      const server = await startPreview({ ...options, port: options.port ? Number(options.port) : undefined, preview: config.preview })
      server.printUrls()
      const shutdown = async () => {
        await closePreview(server)
        process.exit(0)
      }
      process.once('SIGINT', shutdown)
      process.once('SIGTERM', shutdown)
    })
}
