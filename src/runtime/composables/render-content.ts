import { html, type VNode } from '@jasonshimmy/custom-elements-runtime'
import type { ContentItem } from '../../types/content.js'

export type ContentComponentProps = Record<string, Record<string, unknown>>
export interface RenderContentOptions {
  /** Loader data keyed by tag. Attribute-specific resolvers support repeated components. */
  components?: Record<string, Record<string, unknown> | ((attrs: Record<string, unknown>) => Record<string, unknown>)>
}

/** Parse trusted generated Markdown HTML into VNodes so registered components receive SSR. */
export function renderContent(doc: Pick<ContentItem, 'body'> | null, options: RenderContentOptions = {}): VNode | VNode[] {
  if (!doc) return []
  const strings = Object.assign([doc.body], { raw: [doc.body] }) as unknown as TemplateStringsArray
  const nodes = html(strings)
  function visit(node: VNode): void {
    const resolver = options.components?.[node.tag]
    if (resolver) {
      const props = typeof resolver === 'function' ? resolver(node.props?.attrs ?? {}) : resolver
      node.props = { ...node.props, props: { ...node.props?.props, ...props } }
    }
    if (Array.isArray(node.children)) node.children.forEach(visit)
  }
  ;(Array.isArray(nodes) ? nodes : [nodes]).forEach(visit)
  return nodes
}
