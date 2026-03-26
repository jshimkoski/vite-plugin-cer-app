import { ref } from '@jasonshimmy/custom-elements-runtime'
import type { ReactiveState } from '@jasonshimmy/custom-elements-runtime'

type StateMap = Map<string, ReactiveState<unknown>>

/**
 * useState — globally-keyed reactive state shared across layouts, pages, and components.
 *
 * Returns the same reactive ref for a given key across all components. Mutating the
 * ref in one component (page, layout, or component) automatically triggers re-renders
 * in every other component that reads the same key.
 *
 * Works isomorphically:
 * - **SSR/SSG**: state is scoped per-request via AsyncLocalStorage so concurrent renders
 *   never share state. Set initial values inside a page `loader` (which runs before
 *   rendering) so the layout can read them synchronously during the render pass.
 *   After rendering, all state values are serialized into `window.__CER_STATE_INIT__`
 *   and hydrated on the client so there is no flash to default values after hydration.
 * - **Client**: state is a global singleton Map — refs are shared across the whole
 *   component tree and changes propagate reactively. On first use, the Map is
 *   pre-populated from `window.__CER_STATE_INIT__` (the SSR snapshot) if present.
 *
 * @param key  Unique string key for this piece of state.
 * @param init Initial value or factory function. Only evaluated when the key does not
 *             yet exist in the store (i.e. on first call for a given key per request/session).
 *
 * @example
 * ```ts
 * // app/pages/about.ts — set title in loader so layout sees it on SSR
 * export const loader = async () => {
 *   useState<string>('pageTitle').value = 'About Us'
 *   return {}
 * }
 *
 * component('page-about', () => {
 *   const title = useState<string>('pageTitle')
 *   return html`<h1>${title.value}</h1>`
 * })
 * ```
 *
 * @example
 * ```ts
 * // app/layouts/default.ts — reads the same ref; re-renders when value changes
 * component('layout-default', () => {
 *   const title = useState('pageTitle', 'My App')  // fallback default
 *   return html`
 *     <h1>${title.value}</h1>
 *     <slot></slot>
 *   `
 * })
 * ```
 */
export function useState<T>(key: string, init?: T | (() => T)): ReactiveState<T> {
  const g = globalThis as Record<string, unknown>

  // ── SSR path ──────────────────────────────────────────────────────────────
  // __CER_STATE_STORE__ is an AsyncLocalStorage<StateMap> set by entry-server-template.
  // Only set on the server — not present in the client bundle.
  const stateStore = g['__CER_STATE_STORE__'] as { getStore(): StateMap | undefined } | undefined
  if (stateStore) {
    const map = stateStore.getStore()
    if (map) {
      if (!map.has(key)) {
        const initValue = typeof init === 'function' ? (init as () => T)() : (init as T | undefined)
        map.set(key, ref(initValue) as ReactiveState<unknown>)
      }
      return map.get(key) as ReactiveState<T>
    }
  }

  // ── Client path ───────────────────────────────────────────────────────────
  // __CER_STATE__ is a singleton Map on globalThis, created lazily on first use.
  // On creation, pre-populate from window.__CER_STATE_INIT__ (the SSR-serialized
  // snapshot injected by the server handler) so the client boots with the same
  // state the server rendered — no flash to default values on hydration.
  if (!g['__CER_STATE__']) {
    const clientMap = new Map<string, ReactiveState<unknown>>()
    const ssrInit = g['__CER_STATE_INIT__'] as Record<string, unknown> | undefined
    if (ssrInit) {
      for (const [k, v] of Object.entries(ssrInit)) {
        clientMap.set(k, ref(v) as ReactiveState<unknown>)
      }
    }
    g['__CER_STATE__'] = clientMap
  }
  const clientMap = g['__CER_STATE__'] as StateMap
  if (!clientMap.has(key)) {
    const initValue = typeof init === 'function' ? (init as () => T)() : (init as T | undefined)
    clientMap.set(key, ref(initValue) as ReactiveState<unknown>)
  }
  return clientMap.get(key) as ReactiveState<T>
}
