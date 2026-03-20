import { inject } from '@jasonshimmy/custom-elements-runtime'

const _g = globalThis as Record<string, unknown>
const _PROVIDES_KEY = '__cerPluginProvides'

/**
 * useInject — reads a value provided by a plugin via plugin.setup()'s provide().
 *
 * Works consistently across all rendering modes:
 *
 * - **SPA/Client**: Uses inject() from the component context tree (established
 *   by cer-layout-view calling provide() for each plugin-provided value).
 *
 * - **SSR/SSG**: Reads from globalThis.__cerPluginProvides, populated when the
 *   server entry runs plugin.setup() before rendering.
 *
 * @example
 * ```ts
 * // In a plugin (app/plugins/my-plugin.ts):
 * export default {
 *   name: 'my-plugin',
 *   setup({ provide }) {
 *     provide('my-service', { greet: () => 'hello' })
 *   }
 * }
 *
 * // In a component:
 * component('my-page', () => {
 *   const service = useInject<{ greet(): string }>('my-service')
 * })
 * ```
 */
export function useInject<T = unknown>(key: string, defaultValue?: T): T | undefined {
  // Server-side (SSR/SSG): read from the global plugin provides map.
  // __cerPluginProvides is populated by the server entry before the render pass.
  if (typeof document === 'undefined') {
    const pluginProvides = _g[_PROVIDES_KEY] as Map<PropertyKey, unknown> | undefined
    const value = pluginProvides?.get(key)
    return value !== undefined ? (value as T) : defaultValue
  }

  // Client-side: inject() walks the component context tree established by
  // cer-layout-view's provide() calls. Falls back to __cerPluginProvides for
  // reads before cer-layout-view mounts (e.g. during plugin-registered components).
  const value = inject<T>(key)
  if (value !== undefined) return value
  const pluginProvides = _g[_PROVIDES_KEY] as Map<PropertyKey, unknown> | undefined
  return (pluginProvides?.get(key) as T | undefined) ?? defaultValue
}
