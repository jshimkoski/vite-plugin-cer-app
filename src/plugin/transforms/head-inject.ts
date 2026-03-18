export interface HeadTag {
  tag: string
  attrs?: Record<string, string>
  innerHTML?: string
}

export interface HeadInput {
  title?: string
  meta?: Array<Record<string, string>>
  link?: Array<Record<string, string>>
  script?: Array<Record<string, string>>
  style?: Array<Record<string, string>>
}

/**
 * Inserts stringified head tags before the closing </head> tag.
 * If no </head> is found, prepends to the document.
 */
export function injectHead(html: string, headTags: HeadTag[]): string {
  if (headTags.length === 0) return html

  const serialized = headTags.map(serializeTag).join('\n')

  const closeHeadIdx = html.indexOf('</head>')
  if (closeHeadIdx !== -1) {
    return html.slice(0, closeHeadIdx) + serialized + '\n' + html.slice(closeHeadIdx)
  }

  // No </head> found: prepend
  return serialized + '\n' + html
}

/**
 * Serializes a single HeadTag to an HTML string.
 */
function serializeTag(tag: HeadTag): string {
  const attrs = tag.attrs
    ? Object.entries(tag.attrs)
        .map(([k, v]) => (v === '' ? k : `${k}="${escapeAttr(v)}"`))
        .join(' ')
    : ''

  const openTag = attrs ? `<${tag.tag} ${attrs}>` : `<${tag.tag}>`

  if (tag.innerHTML !== undefined) {
    return `${openTag}${tag.innerHTML}</${tag.tag}>`
  }

  // Self-closing for void elements
  const voidTags = new Set(['meta', 'link', 'base', 'br', 'hr', 'img', 'input'])
  if (voidTags.has(tag.tag)) {
    return attrs ? `<${tag.tag} ${attrs}>` : `<${tag.tag}>`
  }

  return `${openTag}</${tag.tag}>`
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * HeadCollector gathers HeadInput objects during SSR and serializes them
 * to an HTML string for injection into the document head.
 */
export class HeadCollector {
  private readonly _collected: HeadInput[] = []

  collect(tags: HeadInput): void {
    this._collected.push(tags)
  }

  serialize(): string {
    const tags = headInputToTags(this._collected)
    return tags.map(serializeTag).join('\n')
  }

  reset(): void {
    this._collected.length = 0
  }

  getCollected(): HeadInput[] {
    return [...this._collected]
  }
}

/**
 * Converts an array of HeadInput objects to a flat array of HeadTags.
 * Later entries override earlier ones for title; meta/link/script/style are merged.
 */
function headInputToTags(inputs: HeadInput[]): HeadTag[] {
  const tags: HeadTag[] = []

  // Collect title — last one wins
  let title: string | undefined
  for (const input of inputs) {
    if (input.title !== undefined) {
      title = input.title
    }
  }
  if (title !== undefined) {
    tags.push({ tag: 'title', innerHTML: escapeHtml(title) })
  }

  // Collect meta tags (deduplicate by name/property)
  const metaMap = new Map<string, Record<string, string>>()
  for (const input of inputs) {
    if (input.meta) {
      for (const meta of input.meta) {
        const key = meta.name ?? meta.property ?? meta.charset ?? JSON.stringify(meta)
        metaMap.set(key, meta)
      }
    }
  }
  for (const attrs of metaMap.values()) {
    tags.push({ tag: 'meta', attrs })
  }

  // Collect link tags (deduplicate by rel+href)
  const linkMap = new Map<string, Record<string, string>>()
  for (const input of inputs) {
    if (input.link) {
      for (const link of input.link) {
        const key = `${link.rel ?? ''}:${link.href ?? ''}`
        linkMap.set(key, link)
      }
    }
  }
  for (const attrs of linkMap.values()) {
    tags.push({ tag: 'link', attrs })
  }

  // Collect script tags
  for (const input of inputs) {
    if (input.script) {
      for (const script of input.script) {
        const { innerHTML, ...attrs } = script as Record<string, string>
        tags.push({ tag: 'script', attrs, innerHTML })
      }
    }
  }

  // Collect style tags
  for (const input of inputs) {
    if (input.style) {
      for (const style of input.style) {
        const { innerHTML, ...attrs } = style as Record<string, string>
        tags.push({ tag: 'style', attrs, innerHTML })
      }
    }
  }

  return tags
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
