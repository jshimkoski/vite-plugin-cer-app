import { Command } from 'commander'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { resolve, join, extname } from 'pathe'
import { pathToFileURL } from 'node:url'

/**
 * Matches an API route pattern (e.g. '/api/items/:id') against a URL path.
 * Returns a params object on match, or null if the pattern does not match.
 */
function matchApiPattern(pattern: string, urlPath: string): Record<string, string> | null {
  const patternParts = pattern.split('/')
  const urlParts = urlPath.split('/')
  if (patternParts.length !== urlParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]
    const u = urlParts[i]
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(u)
    } else if (p !== u) {
      return null
    }
  }
  return params
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
}

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

/**
 * Serves a static file from the dist directory.
 * Returns true if the file was served, false otherwise.
 */
function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  distDir: string,
): boolean {
  const urlPath = (req.url ?? '/').split('?')[0]

  // Try exact file path
  let filePath = join(distDir, urlPath)

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // Try index.html in the directory
    const indexPath = join(distDir, urlPath, 'index.html')
    if (existsSync(indexPath)) {
      filePath = indexPath
    } else if (existsSync(join(distDir, 'index.html'))) {
      // SPA fallback: serve root index.html
      filePath = join(distDir, 'index.html')
    } else {
      return false
    }
  }

  res.setHeader('Content-Type', getMimeType(filePath))
  res.setHeader('Cache-Control', 'no-cache')
  createReadStream(filePath).pipe(res)
  return true
}

export function previewCommand(): Command {
  return new Command('preview')
    .description('Preview the production build')
    .option('-p, --port <port>', 'Port to listen on', '4173')
    .option('--host <host>', 'Host to bind to', 'localhost')
    .option('--root <root>', 'Project root directory', process.cwd())
    .option('--ssr', 'Serve using SSR handler from dist/server/server.js')
    .action(async (options) => {
      const root = resolve(options.root)
      const port = parseInt(options.port, 10)
      const distDir = join(root, 'dist')
      const serverBundle = join(distDir, 'server/server.js')

      // Check if SSR server bundle exists.
      // An SSG build also produces a server bundle, but previewing SSG means serving
      // the pre-rendered static HTML — detect the SSG manifest to avoid switching to
      // live SSR mode for SSG builds.
      const hasServerBundle = existsSync(serverBundle)
      const hasSsgManifest = existsSync(join(distDir, 'ssg-manifest.json'))
      const useSSR = options.ssr || (hasServerBundle && !hasSsgManifest)

      if (useSSR && hasServerBundle) {
        console.log('[cer-app] Starting SSR preview server...')

        // Load the server bundle
        let serverMod: {
          handler?: Function
          default?: Function
          apiRoutes?: Array<{ path: string; handlers: Record<string, unknown> }>
        }
        try {
          serverMod = await import(pathToFileURL(serverBundle).href)
        } catch (err) {
          console.error('[cer-app] Failed to load server bundle:', err)
          process.exit(1)
        }

        const handler = serverMod.handler ?? serverMod.default
        if (typeof handler !== 'function') {
          console.error('[cer-app] Server bundle does not export a handler function.')
          process.exit(1)
        }

        // API route array exported by the server bundle: [{ path, handlers }]
        const apiRoutes: Array<{ path: string; handlers: Record<string, unknown> }> =
          Array.isArray(serverMod.apiRoutes) ? serverMod.apiRoutes : []

        const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
          const url = req.url ?? '/'
          const urlPath = url.split('?')[0]
          const method = req.method ?? 'GET'

          // Route /api/* requests to the server bundle's API handlers
          if (urlPath.startsWith('/api/')) {
            for (const route of apiRoutes) {
              const matched = matchApiPattern(route.path, urlPath)
              if (matched !== null) {
                const augReq = req as IncomingMessage & { params: Record<string, string> }
                augReq.params = matched
                const augRes = res as ServerResponse & {
                  json(data: unknown): void
                  status(code: number): typeof augRes
                }
                augRes.json = function (data) {
                  this.setHeader('Content-Type', 'application/json; charset=utf-8')
                  this.end(JSON.stringify(data))
                }
                augRes.status = function (code) { this.statusCode = code; return this }

                const handlerFn =
                  (route.handlers[method.toLowerCase()] as Function | undefined) ??
                  (route.handlers[method.toUpperCase()] as Function | undefined) ??
                  (route.handlers['default'] as Function | undefined)

                if (typeof handlerFn === 'function') {
                  try {
                    await handlerFn(augReq, augRes)
                  } catch (err) {
                    console.error(`[cer-app] API handler error at ${route.path}:`, err)
                    res.statusCode = 500
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify({ error: 'Internal Server Error' }))
                  }
                  return
                }
              }
            }
            res.statusCode = 404
            res.end('Not Found')
            return
          }

          // Serve static assets from dist/client first
          const clientDist = join(distDir, 'client')
          if (existsSync(clientDist) && url !== '/' && url.includes('.')) {
            const served = serveStaticFile(req, res, clientDist)
            if (served) return
          }

          // Fall through to SSR handler
          try {
            await handler(req, res)
          } catch (err) {
            console.error('[cer-app] SSR handler error:', err)
            res.statusCode = 500
            res.end('Internal Server Error')
          }
        })

        server.listen(port, options.host, () => {
          console.log(`[cer-app] SSR preview running at http://${options.host}:${port}`)
        })
      } else {
        // Static file server (SPA / SSG)
        console.log('[cer-app] Starting static preview server...')

        if (!existsSync(distDir)) {
          console.error(`[cer-app] No dist/ directory found at ${distDir}. Run 'cer-app build' first.`)
          process.exit(1)
        }

        const server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
          const urlPath = (req.url ?? '/').split('?')[0]
          // SSG builds put assets in dist/client/ while HTML lives in dist/.
          // For requests with a non-HTML file extension, check dist/client/ first
          // so the static server finds the Vite-built JS/CSS bundles.
          const clientDist = join(distDir, 'client')
          const ext = extname(urlPath).toLowerCase()
          if (ext && ext !== '.html' && existsSync(clientDist)) {
            const assetPath = join(clientDist, urlPath)
            if (existsSync(assetPath) && !statSync(assetPath).isDirectory()) {
              res.setHeader('Content-Type', getMimeType(assetPath))
              res.setHeader('Cache-Control', 'no-cache')
              createReadStream(assetPath).pipe(res)
              return
            }
          }
          const served = serveStaticFile(req, res, distDir)
          if (!served) {
            res.statusCode = 404
            res.end('Not Found')
          }
        })

        server.listen(port, options.host, () => {
          console.log(`[cer-app] Static preview running at http://${options.host}:${port}`)
        })
      }

      process.on('SIGTERM', () => process.exit(0))
      process.on('SIGINT', () => process.exit(0))
    })
}
