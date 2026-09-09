import { nextTick, ref, useOnConnected, watch } from '@jasonshimmy/custom-elements-runtime'
import type { ContentHeading } from '../../types/content.js'

type HeadingSource = readonly ContentHeading[] | { value: readonly ContentHeading[] }

export interface ActiveHeadingsOptions {
  /** DOM root containing the rendered headings. Defaults to document. */
  root?: ParentNode | (() => ParentNode | null)
  /** Sticky-header offset in pixels. Defaults to 0. */
  offset?: number
  /** IntersectionObserver root, when observing inside a scroll container. */
  observerRoot?: Element | null
  /** Override the observer margin. */
  rootMargin?: string
}

function sourceValue(source: HeadingSource): readonly ContentHeading[] {
  return Array.isArray(source)
    ? source
    : (source as { value: readonly ContentHeading[] }).value
}

function resolveRoot(root: ActiveHeadingsOptions['root']): ParentNode | null {
  if (typeof root === 'function') return root()
  return root ?? (typeof document !== 'undefined' ? document : null)
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Tracks visible content headings with one IntersectionObserver. This avoids
 * scroll-event layout reads and works with document, light-DOM, and shadow roots.
 */
export function useActiveHeadings(source: HeadingSource, options: ActiveHeadingsOptions = {}) {
  const activeIds = ref<string[]>([])
  const intersecting = new Set<string>()
  const headingTops = new Map<string, number>()

  useOnConnected(() => {
    let observer: IntersectionObserver | null = null
    let observationRevision = 0
    let disposed = false

    const observe = () => {
      observer?.disconnect()
      intersecting.clear()
      headingTops.clear()
      activeIds.value = []
      const headings = sourceValue(source)
      const root = resolveRoot(options.root)
      if (!root || headings.length === 0) return

      // Establish a useful state immediately. IntersectionObserver callbacks
      // are asynchronous, and on an entry navigation every heading may begin
      // below the narrowed activation band even though the first section is
      // the section the reader is approaching.
      activeIds.value = [headings[0].id]

      if (typeof IntersectionObserver === 'undefined') {
        return
      }

      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id
          if (!id) continue
          const top = entry.boundingClientRect?.top
          if (Number.isFinite(top)) headingTops.set(id, top)
          if (entry.isIntersecting) intersecting.add(id)
          else intersecting.delete(id)
        }
        const orderedIds = sourceValue(source).map((heading) => heading.id)
        const visibleIds = orderedIds.filter((id) => intersecting.has(id))
        if (visibleIds.length > 0) {
          activeIds.value = visibleIds
          return
        }

        // When the activation band lies in the gap between headings, keep the
        // most recently passed section selected. At the top of the article,
        // where no heading has crossed the sticky-header line, select the first
        // section instead of presenting an unexplained empty state.
        const activationTop = options.offset ?? 0
        let fallback = orderedIds[0]
        for (const id of orderedIds) {
          const top = headingTops.get(id)
          if (top !== undefined && top <= activationTop) fallback = id
        }
        activeIds.value = fallback ? [fallback] : []
      }, {
        root: options.observerRoot ?? null,
        rootMargin: options.rootMargin ?? `-${options.offset ?? 0}px 0px -60% 0px`,
        threshold: [0, 1],
      })

      for (const heading of headings) {
        const element = root.querySelector(`[id="${escapeAttribute(heading.id)}"]`)
        if (element) observer.observe(element)
      }
    }

    const scheduleObserve = () => {
      const revision = ++observationRevision
      // A child receives its new heading props while the parent page is still
      // being patched. Waiting for the runtime's DOM queue prevents querying
      // the outgoing article and permanently observing stale heading nodes.
      void nextTick().then(() => {
        if (!disposed && revision === observationRevision) observe()
      })
    }
    scheduleObserve()
    const stop = watch(() => sourceValue(source), scheduleObserve)
    return () => {
      disposed = true
      observationRevision += 1
      stop?.()
      observer?.disconnect()
      intersecting.clear()
      headingTops.clear()
    }
  })

  return {
    activeIds,
    isActive: (id: string) => activeIds.value.includes(id),
  }
}
