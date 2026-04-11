import type { ContentItem, ContentMeta } from '../../types/content.js'

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Reads `router.base` from `virtual:cer-app-config` at module initialisation. */
let _base: string = ''

try {
  // Dynamic import is not viable for a module-level side effect, so we read from
  // globalThis where the virtual module writes it during app bootstrap.
  const g = globalThis as Record<string, unknown>
  const appConfig = g['__CER_APP_CONFIG__'] as { router?: { base?: string } } | undefined
  _base = appConfig?.router?.base ?? ''
  // Normalise: strip trailing slash, keep empty string for no base
  if (_base === '/') _base = ''
} catch {
  _base = ''
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function contentPathToJsonFile(path: string): string {
  if (path === '/') return 'index.json'
  return path.slice(1) + '.json'
}

/** Returns the full URL for the search index (includes router.base prefix). */
export function contentSearchIndexUrl(): string {
  return `${_base}/_content/search-index.json`
}

// ─── Lazy manifest cache ──────────────────────────────────────────────────────

let _manifestPromise: Promise<ContentMeta[]> | null = null

function fetchManifest(): Promise<ContentMeta[]> {
  if (_manifestPromise) return _manifestPromise
  _manifestPromise = fetch(`${_base}/_content/manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch content manifest: ${r.status}`)
    return r.json() as Promise<ContentMeta[]>
  })
  return _manifestPromise
}

// ─── Server-side production caches ───────────────────────────────────────────
// In production SSR the Vite build process is not running, so __CER_CONTENT_STORE__
// is absent.  We cache the manifest and per-document reads here to avoid repeated
// disk I/O on every request — critical at 10k+ pages where manifest.json is ~2MB.

let _ssrManifest: ContentMeta[] | null = null
const _ssrItemCache = new Map<string, ContentItem | null>()

// ─── ContentClient ────────────────────────────────────────────────────────────

/**
 * Low-level content data access layer. Used by `queryContent()`.
 *
 * Resolution strategy:
 * - **Server (dev + SSG build-time)**: reads from `globalThis.__CER_CONTENT_STORE__`
 *   populated by the `cerContent()` Vite plugin's `buildStart` hook.
 * - **Server (production SSR runtime)**: `__CER_CONTENT_STORE__` is absent (no
 *   Vite build process at runtime), so falls back to `node:fs` reads from
 *   `dist/_content/`.
 * - **Client (SPA / browser navigation)**: lazy-fetches `/_content/manifest.json`
 *   once (cached) for listing; fetches `/_content/[path].json` per `.first()`.
 */
export const ContentClient = {
  async getManifest(): Promise<ContentMeta[]> {
    const g = globalThis as Record<string, unknown>

    // Server: in-memory store (dev + SSG build-time rendering)
    const store = g['__CER_CONTENT_STORE__'] as ContentItem[] | undefined
    if (store) {
      return store.map((item) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _file, body, toc, excerpt, ...meta } = item
        return meta as ContentMeta
      })
    }

    // Server: production SSR runtime — resolve content files from the app root.
    // The preview CLI sets process.env.__CER_APP_ROOT__ to the project root before
    // loading the server bundle. Content files are written to dist/server/_content/
    // and dist/client/_content/ by cerContent's closeBundle hook.
    // _ssrManifest is a module-level cache — populated once and reused for the
    // lifetime of the process so manifest.json is only read and parsed once at scale.
    if (typeof window === 'undefined' && typeof process !== 'undefined') {
      if (_ssrManifest) return _ssrManifest
      try {
        const { readFileSync, existsSync } = await import('node:fs')
        const { join } = await import('node:path')
        const appRoot = process.env.__CER_APP_ROOT__ ?? process.cwd()
        const candidates = [
          join(appRoot, 'dist', 'server', '_content', 'manifest.json'),
          join(appRoot, 'dist', 'client', '_content', 'manifest.json'),
          join(appRoot, 'dist', '_content', 'manifest.json'),
        ]
        for (const p of candidates) {
          if (!existsSync(p)) continue
          try {
            const raw = readFileSync(p, 'utf-8')
            _ssrManifest = JSON.parse(raw) as ContentMeta[]
            return _ssrManifest
          } catch { /* try next */ }
        }
        _ssrManifest = []
        return _ssrManifest
      } catch {
        return []
      }
    }

    // Client: fetch manifest (cached)
    return fetchManifest()
  },

  async getItem(path: string): Promise<ContentItem | null> {
    const g = globalThis as Record<string, unknown>

    // Server: in-memory store
    const store = g['__CER_CONTENT_STORE__'] as ContentItem[] | undefined
    if (store) {
      return store.find((item) => item._path === path) ?? null
    }

    // Server: production SSR runtime — see getManifest() for path resolution strategy.
    // _ssrItemCache is a module-level Map so each document is read and parsed at
    // most once per process lifetime, regardless of how many concurrent requests
    // ask for the same path.
    if (typeof window === 'undefined' && typeof process !== 'undefined') {
      if (_ssrItemCache.has(path)) return _ssrItemCache.get(path) ?? null
      try {
        const { readFileSync, existsSync } = await import('node:fs')
        const { join } = await import('node:path')
        const appRoot = process.env.__CER_APP_ROOT__ ?? process.cwd()
        const jsonFile = contentPathToJsonFile(path)
        const candidates = [
          join(appRoot, 'dist', 'server', '_content', jsonFile),
          join(appRoot, 'dist', 'client', '_content', jsonFile),
          join(appRoot, 'dist', '_content', jsonFile),
        ]
        for (const p of candidates) {
          if (!existsSync(p)) continue
          try {
            const raw = readFileSync(p, 'utf-8')
            const item = JSON.parse(raw) as ContentItem
            _ssrItemCache.set(path, item)
            return item
          } catch { /* try next */ }
        }
        _ssrItemCache.set(path, null)
        return null
      } catch {
        return null
      }
    }

    // Client: fetch individual document
    const jsonFile = contentPathToJsonFile(path)
    try {
      const res = await fetch(`${_base}/_content/${jsonFile}`)
      if (!res.ok) return null
      return (await res.json()) as ContentItem
    } catch {
      return null
    }
  },
}
