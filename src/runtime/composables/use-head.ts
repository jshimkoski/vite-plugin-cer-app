/**
 * Describes the `<head>` tags to inject for a page or component.
 * Pass to `useHead()`. All fields are optional; only set fields are emitted.
 */
export interface HeadInput {
  title?: string
  meta?: Array<Record<string, string>>
  link?: Array<Record<string, string>>
  script?: Array<Record<string, string>>
  style?: Array<Record<string, string>>
}

// SSR: store collector on globalThis so all module instances (server entry +
// dynamically-imported page chunks) share the same reference. A module-level
// variable would create separate instances per chunk, breaking the singleton.
const _g = globalThis as Record<string, unknown>
const _KEY = '__CER_HEAD_COLLECTOR__'

/**
 * Begin collecting head tags for an SSR render pass.
 * Call this before invoking the render function.
 */
export function beginHeadCollection(): void {
  _g[_KEY] = [] as HeadInput[]
}

/**
 * End collecting head tags and return the collected inputs.
 * Resets the collector to null.
 */
export function endHeadCollection(): HeadInput[] {
  const collected = (_g[_KEY] as HeadInput[]) ?? []
  _g[_KEY] = null
  return collected
}

/**
 * Serializes an array of HeadInput objects into an HTML string
 * suitable for injection into the document <head>.
 */
export function serializeHeadTags(heads: HeadInput[]): string {
  const parts: string[] = []

  // Merge titles — last one wins
  let title: string | undefined
  for (const head of heads) {
    if (head.title !== undefined) {
      title = head.title
    }
  }
  if (title !== undefined) {
    parts.push(`<title>${escapeHtml(title)}</title>`)
  }

  // Merge meta tags, deduplicate by name/property/charset
  const metaMap = new Map<string, Record<string, string>>()
  for (const head of heads) {
    if (head.meta) {
      for (const meta of head.meta) {
        const key = meta.name ?? meta.property ?? meta.charset ?? JSON.stringify(meta)
        metaMap.set(key, meta)
      }
    }
  }
  for (const attrs of metaMap.values()) {
    parts.push(`<meta ${renderAttrs(attrs)}>`)
  }

  // Merge link tags, deduplicate by rel+href
  const linkMap = new Map<string, Record<string, string>>()
  for (const head of heads) {
    if (head.link) {
      for (const link of head.link) {
        const key = `${link.rel ?? ''}:${link.href ?? ''}`
        linkMap.set(key, link)
      }
    }
  }
  for (const attrs of linkMap.values()) {
    parts.push(`<link ${renderAttrs(attrs)}>`)
  }

  // Script tags
  for (const head of heads) {
    if (head.script) {
      for (const script of head.script) {
        const { innerHTML, ...rest } = script as Record<string, string>
        if (innerHTML !== undefined) {
          parts.push(`<script ${renderAttrs(rest)}>${innerHTML}</script>`)
        } else {
          parts.push(`<script ${renderAttrs(rest)}></script>`)
        }
      }
    }
  }

  // Style tags
  for (const head of heads) {
    if (head.style) {
      for (const style of head.style) {
        const { innerHTML, ...rest } = style as Record<string, string>
        if (innerHTML !== undefined) {
          parts.push(`<style ${renderAttrs(rest)}>${innerHTML}</style>`)
        } else {
          parts.push(`<style ${renderAttrs(rest)}></style>`)
        }
      }
    }
  }

  return parts.join('\n')
}

/**
 * useHead composable.
 *
 * - During SSR: pushes to the request-scoped collector (set up via beginHeadCollection)
 * - On the client: imperatively updates document.title and meta/link tags
 */
export function useHead(input: HeadInput): void {
  const collector = _g[_KEY] as HeadInput[] | null | undefined
  if (collector != null) {
    // SSR mode: push to the shared globalThis collector
    collector.push(input)
  } else if (typeof document !== 'undefined') {
    // Client-side
    if (input.title !== undefined) {
      document.title = input.title
    }

    if (input.meta) {
      for (const meta of input.meta) {
        const name = meta.name ?? meta.property
        if (name) {
          // Try to update existing meta, or create a new one
          let el = document.querySelector(
            meta.name ? `meta[name="${meta.name}"]` : `meta[property="${meta.property}"]`,
          )
          if (!el) {
            el = document.createElement('meta')
            document.head.appendChild(el)
          }
          for (const [k, v] of Object.entries(meta)) {
            el.setAttribute(k, v)
          }
        }
      }
    }

    if (input.link) {
      for (const link of input.link) {
        const rel = link.rel
        const href = link.href
        if (rel && href) {
          // Canonical and icon links are singletons — find by rel alone so that
          // updating the URL overwrites the existing tag rather than adding a
          // duplicate. All other link types are matched by rel+href (e.g.
          // stylesheets, where multiple hrefs are valid).
          const isSingleton = rel === 'canonical' || rel === 'icon' || rel === 'shortcut icon'
          let el = isSingleton
            ? document.querySelector(`link[rel="${rel}"]`)
            : document.querySelector(`link[rel="${rel}"][href="${href}"]`)
          if (!el) {
            el = document.createElement('link')
            document.head.appendChild(el)
          }
          for (const [k, v] of Object.entries(link)) {
            el.setAttribute(k, v)
          }
        }
      }
    }

    if (input.script) {
      for (const script of input.script) {
        const { innerHTML, src, ...rest } = script as Record<string, string>
        // Only add if not already present (by src)
        if (src && !document.querySelector(`script[src="${src}"]`)) {
          const el = document.createElement('script')
          el.src = src
          for (const [k, v] of Object.entries(rest)) {
            el.setAttribute(k, v)
          }
          document.head.appendChild(el)
        } else if (innerHTML && !src) {
          const type = rest.type ?? ''
          if (type === 'application/ld+json') {
            // JSON-LD is a singleton — update existing content rather than
            // appending a duplicate on re-render or SPA navigation.
            let el = document.querySelector('script[type="application/ld+json"]')
            if (!el) {
              el = document.createElement('script')
              document.head.appendChild(el)
              for (const [k, v] of Object.entries(rest)) {
                el.setAttribute(k, v)
              }
            }
            ;(el as HTMLScriptElement).textContent = innerHTML
          } else {
            const el = document.createElement('script')
            el.textContent = innerHTML
            for (const [k, v] of Object.entries(rest)) {
              el.setAttribute(k, v)
            }
            document.head.appendChild(el)
          }
        }
      }
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => (v === '' ? k : `${k}="${escapeAttr(v)}"`))
    .join(' ')
}
