/**
 * HTML post-processing transforms applied to every SSG-rendered page.
 *
 * Each function is a pure string → string transform. They are composed in
 * build-ssg.ts after the server bundle renders each path.
 */

// ---------------------------------------------------------------------------
// Favicon injection
// ---------------------------------------------------------------------------

/**
 * Injects `<link rel="icon" href="${faviconHref}">` before `</head>` when no
 * `<link rel="icon">` or `<link rel="shortcut icon">` is already present.
 */
export function injectFaviconLink(html: string, faviconHref: string): string {
  if (/<link[^>]+rel=["'](?:shortcut )?icon["']/i.test(html)) return html
  const tag = `<link rel="icon" href="${faviconHref}">`
  return insertBeforeHead(html, tag)
}

// ---------------------------------------------------------------------------
// Canonical link injection
// ---------------------------------------------------------------------------

/**
 * Injects `<link rel="canonical" href="${url}">` before `</head>` when no
 * `<link rel="canonical">` is already present.
 */
export function injectCanonicalLink(html: string, url: string): string {
  if (/<link[^>]+rel=["']canonical["']/i.test(html)) return html
  const tag = `<link rel="canonical" href="${escapeAttr(url)}">`
  return insertBeforeHead(html, tag)
}

// ---------------------------------------------------------------------------
// noopener / noreferrer on external target="_blank" links
// ---------------------------------------------------------------------------

/**
 * Adds `rel="noopener noreferrer"` to every `<a target="_blank">` element
 * that does not already have a `rel` attribute containing both values.
 *
 * Only touches anchor tags — not `<form>` or other elements with `target`.
 */
export function addNoopenerToExternalLinks(html: string): string {
  return html.replace(
    /(<a\b[^>]*\btarget\s*=\s*["']_blank["'][^>]*)(>)/gi,
    (match, attrs: string, close: string) => {
      const relMatch = attrs.match(/\brel\s*=\s*["']([^"']*)["']/i)
      if (relMatch) {
        const existing = relMatch[1]
        const hasNoopener = /\bnoopener\b/i.test(existing)
        const hasNoreferrer = /\bnoreferrer\b/i.test(existing)
        if (hasNoopener && hasNoreferrer) return match
        const parts = existing.trim().split(/\s+/).filter(Boolean)
        if (!hasNoopener) parts.push('noopener')
        if (!hasNoreferrer) parts.push('noreferrer')
        return attrs.replace(relMatch[0], `rel="${parts.join(' ')}"`) + close
      }
      return `${attrs} rel="noopener noreferrer"${close}`
    },
  )
}

// ---------------------------------------------------------------------------
// robots.txt generation
// ---------------------------------------------------------------------------

/**
 * Generates the content of a `robots.txt` file.
 * When `siteUrl` is provided a `Sitemap:` directive is included.
 */
export function generateRobotsTxt(siteUrl: string | null): string {
  const lines = ['User-agent: *', 'Allow: /']
  if (siteUrl) {
    lines.push('', `Sitemap: ${siteUrl}/sitemap.xml`)
  }
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertBeforeHead(html: string, tag: string): string {
  const idx = html.indexOf('</head>')
  if (idx !== -1) {
    return html.slice(0, idx) + tag + '\n' + html.slice(idx)
  }
  return tag + '\n' + html
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
