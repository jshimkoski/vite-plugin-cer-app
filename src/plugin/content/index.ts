import { join } from 'pathe'
import { existsSync } from 'node:fs'
import type { Plugin, ViteDevServer, ResolvedConfig } from 'vite'
import type { CerContentConfig } from '../../types/content.js'
import type { ContentItem } from '../../types/content.js'
import { scanContentFiles } from './scanner.js'
import { parseContentFileAsync, toContentMeta } from './parser.js'
import { emitContentFiles } from './emitter.js'
import { buildSearchIndex } from './search.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** The globalThis key used to share the in-memory content store with ContentClient. */
export const CONTENT_STORE_KEY = '__CER_CONTENT_STORE__'

/**
 * Resolves the absolute content directory from the framework config.
 * `dir` is relative to the project root (not the app source directory),
 * so `content/` sits alongside `app/`, `server/`, and `public/`.
 */
export function resolveContentDir(root: string, contentConfig?: CerContentConfig): string {
  const dir = contentConfig?.dir ?? 'content'
  return join(root, dir)
}

/**
 * Loads all content files from `contentDir`, parses them concurrently, and
 * returns the full `ContentItem[]`. Excludes drafts in production unless
 * `drafts: true`. Uses async I/O + `Promise.all` for concurrent disk reads,
 * which is significantly faster than sequential `readFileSync` at 10k+ pages.
 */
export async function loadContentStore(
  contentDir: string,
  isDraft: boolean,
  isProduction: boolean,
): Promise<ContentItem[]> {
  if (!existsSync(contentDir)) return []

  const files = await scanContentFiles(contentDir)

  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const item = await parseContentFileAsync(file, contentDir)
        // Skip drafts in production (unless drafts flag is set)
        if (isProduction && !isDraft && item.draft === true) return null
        return item
      } catch (err) {
        // Warn and skip unparseable / invalid files so one bad file does not
        // abort the entire build.  Invalid JSON files produce a descriptive
        // error from the parser; other errors are also surfaced here.
        console.warn(
          `[cer-app] Skipping content file (parse error): ${file.filePath}\n  ${(err as Error).message}`,
        )
        return null
      }
    }),
  )

  return results.filter((item): item is ContentItem => item !== null)
}

// ─── Dev server derived-data cache ───────────────────────────────────────────
// Re-computing the manifest JSON and search index on every request is O(n) at
// 10k+ pages. Cache them as serialised strings, keyed by the store array
// reference. When refreshStore() replaces the store, the reference changes
// and the cache is automatically invalidated on the next request.

let _devCacheStoreRef: ContentItem[] | null = null
let _devCacheManifestJson: string | null = null
let _devCacheSearchIndexJson: string | null = null

function invalidateDevCaches(): void {
  _devCacheStoreRef = null
  _devCacheManifestJson = null
  _devCacheSearchIndexJson = null
}

function ensureDevCache(store: ContentItem[]): void {
  if (_devCacheStoreRef === store) return
  _devCacheStoreRef = store
  _devCacheManifestJson = JSON.stringify(store.map(toContentMeta))
  _devCacheSearchIndexJson = buildSearchIndex(store)
}

/**
 * Registers the `/_content/*` dev middleware that serves content from the
 * in-memory store populated by `buildStart`.
 */
function registerDevMiddleware(server: ViteDevServer, _contentDir: string): void {
  server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req as { url?: string }).url ?? ''
    if (!url.startsWith('/_content/')) {
      next()
      return
    }

    const g = globalThis as Record<string, unknown>
    const store = g[CONTENT_STORE_KEY] as ContentItem[] | undefined

    if (!store) {
      res.statusCode = 503
      res.end('Content store not ready')
      return
    }

    // Rebuild derived caches if the store reference has changed (post-HMR).
    ensureDevCache(store)

    const suffix = url.slice('/_content/'.length).split('?')[0]

    if (suffix === 'manifest.json') {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(_devCacheManifestJson!)
      return
    }

    if (suffix === 'search-index.json') {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(_devCacheSearchIndexJson!)
      return
    }

    // Individual document: suffix is like "blog/hello.json" or "index.json"
    if (suffix.endsWith('.json')) {
      const rawPath = suffix.slice(0, -'.json'.length) // strip .json
      // Reverse the contentPathToFile mapping:
      // "index" → "/" and "blog/hello" → "/blog/hello"
      const _path = rawPath === 'index' ? '/' : '/' + rawPath
      const item = store.find((i) => i._path === _path)
      if (item) {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(item))
        return
      }
    }

    res.statusCode = 404
    res.end('Not found')
  })
}

/**
 * `cerContent()` — Vite sub-plugin that provides the file-based content layer.
 *
 * - `buildStart`: scans and parses the content directory, populates `globalThis.__CER_CONTENT_STORE__`
 * - `configureServer`: registers `/_content/*` dev middleware from the same store; watches for HMR
 * - `closeBundle`: emits `_content/*.json` into the Vite output directory for this build
 *   (e.g. `dist/client/_content/` for SSR client, `dist/_content/` for SPA/SSG)
 *
 * The content directory is resolved relative to the **project root** (not the
 * app source directory), so a default config produces `{root}/content/` — at
 * the same level as `app/`, `server/`, and `public/`.
 */
export function cerContent(
  contentConfig?: CerContentConfig,
): Plugin {
  const contentDirName = contentConfig?.dir ?? 'content'
  const includeDrafts = contentConfig?.drafts ?? false
  // Resolved in configResolved; empty until then.
  let _resolvedContentDir = ''
  let _resolvedOutDir = ''
  let _isSsr = false

  const plugin: Plugin = {
    name: '@jasonshimmy/vite-plugin-cer-app:content',

    configResolved(resolvedConfig: ResolvedConfig) {
      // Content lives at {root}/{dir} — parallel to app/, server/, public/.'
      _resolvedContentDir = join(resolvedConfig.root, contentDirName)
      _resolvedOutDir = resolvedConfig.build.outDir
      _isSsr = !!resolvedConfig.build.ssr
    },

    async buildStart() {
      const isProduction = this.meta.watchMode === false
      const items = await loadContentStore(_resolvedContentDir, includeDrafts, isProduction)
      const g = globalThis as Record<string, unknown>
      g[CONTENT_STORE_KEY] = items
    },

    configureServer(server: ViteDevServer) {
      registerDevMiddleware(server, _resolvedContentDir)

      // HMR: re-parse on content file changes
      server.watcher.add(_resolvedContentDir)

      server.watcher.on('add', async (file: string) => {
        if (!file.startsWith(_resolvedContentDir)) return
        await refreshStore(_resolvedContentDir, includeDrafts)
        server.ws.send({ type: 'full-reload' })
      })

      server.watcher.on('change', async (file: string) => {
        if (!file.startsWith(_resolvedContentDir)) return
        await refreshStore(_resolvedContentDir, includeDrafts)
        server.ws.send({ type: 'full-reload' })
      })

      server.watcher.on('unlink', async (file: string) => {
        if (!file.startsWith(_resolvedContentDir)) return
        await refreshStore(_resolvedContentDir, includeDrafts)
        server.ws.send({ type: 'full-reload' })
      })
    },

    closeBundle() {
      // Only emit for the client/SPA/SSG build pass, not the SSR server bundle pass.
      // This prevents double scanning, parsing, and writing at build time.
      // The SSR runtime reads from dist/client/_content/ (or dist/_content/) at runtime.
      if (_isSsr) return
      const g = globalThis as Record<string, unknown>
      // Use the populated store; fall back to [] so the client never receives a 404 on
      // /_content/manifest.json even if buildStart failed to populate the store.
      const store = (g[CONTENT_STORE_KEY] as ContentItem[] | undefined) ?? []

      const searchIndex = buildSearchIndex(store)
      emitContentFiles(store, _resolvedOutDir, searchIndex)
    },
  }

  return plugin
}

async function refreshStore(contentDir: string, includeDrafts: boolean): Promise<void> {
  // HMR runs in dev (watchMode=true) — use isProduction=false so draft items
  // remain visible, matching the initial buildStart behaviour in dev mode.
  const items = await loadContentStore(contentDir, includeDrafts, false)
  const g = globalThis as Record<string, unknown>
  g[CONTENT_STORE_KEY] = items
  // Invalidate the dev middleware caches so the next request rebuilds manifest
  // and search-index from the updated store.
  invalidateDevCaches()
}
