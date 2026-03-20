import '@jasonshimmy/custom-elements-runtime/css'
import 'virtual:cer-jit-css'
import 'virtual:cer-components'
import routes from 'virtual:cer-routes'
import layouts from 'virtual:cer-layouts'
import plugins from 'virtual:cer-plugins'
import { hasLoading, loadingTag } from 'virtual:cer-loading'
import { hasError, errorTag } from 'virtual:cer-error'
import {
  component,
  ref,
  provide,
  useOnConnected,
  useOnDisconnected,
  registerBuiltinComponents,
} from '@jasonshimmy/custom-elements-runtime'
import { initRouter } from '@jasonshimmy/custom-elements-runtime/router'
import { enableJITCSS } from '@jasonshimmy/custom-elements-runtime/jit-css'

registerBuiltinComponents()
enableJITCSS()

const router = initRouter({ routes })

const isNavigating = ref(false)
const currentError = ref(null)
;(globalThis as any).resetError = () => {
  currentError.value = null
  router.replace(router.getCurrent().path)
}

const _push = router.push.bind(router)
const _replace = router.replace.bind(router)
router.push = async (path) => {
  isNavigating.value = true
  currentError.value = null
  try { await _push(path) } catch (err) { currentError.value = err instanceof Error ? err.message : String(err) } finally { isNavigating.value = false }
}
router.replace = async (path) => {
  isNavigating.value = true
  currentError.value = null
  try { await _replace(path) } catch (err) { currentError.value = err instanceof Error ? err.message : String(err) } finally { isNavigating.value = false }
}

const _pluginProvides = new Map<string, unknown>()
;(globalThis as any).__cerPluginProvides = _pluginProvides

component('cer-layout-view', () => {
  for (const [key, value] of _pluginProvides) {
    provide(key, value)
  }

  const current = ref(router.getCurrent())
  let unsub: (() => void) | undefined
  useOnConnected(() => { unsub = router.subscribe((s: typeof current.value) => { current.value = s }) })
  useOnDisconnected(() => { unsub?.(); unsub = undefined })

  if (currentError.value !== null) {
    if (hasError && errorTag) return { tag: errorTag, props: { attrs: { error: String(currentError.value) } }, children: [] }
    return { tag: 'div', props: { attrs: { style: 'padding:2rem;font-family:monospace' } }, children: String(currentError.value) }
  }
  if (isNavigating.value && hasLoading && loadingTag) return { tag: loadingTag, props: {}, children: [] }

  const matched = router.matchRoute(current.value.path)
  const layoutName = (matched?.route as any)?.meta?.layout ?? 'default'
  const layoutTag = (layouts as Record<string, string>)[layoutName]
  const routerView = { tag: 'router-view', props: {}, children: [] }
  return layoutTag ? { tag: layoutTag, props: {}, children: [routerView] } : routerView
})

for (const plugin of plugins) {
  if (plugin && typeof plugin.setup === 'function') {
    await plugin.setup({ router, provide: (key: string, value: unknown) => { _pluginProvides.set(key, value) }, config: {} })
  }
}

// Pre-load the current page's route chunk AFTER plugins run so that
// cer-layout-view's first render (which calls provide()) completes before
// page components are defined. This ensures inject() in child components
// can find values stored by provide().
if (typeof window !== 'undefined') {
  const _initMatch = router.matchRoute(window.location.pathname)
  if (_initMatch?.route?.load) {
    try { await _initMatch.route.load() } catch { /* non-fatal */ }
  }
}

if (typeof window !== 'undefined') {
  // Use the original (unwrapped) replace so isNavigating stays false on first
  // paint — the loading component must not flash over pre-rendered SSG content.
  await _replace(window.location.pathname + window.location.search + window.location.hash)
  // Clear SSR hydration data after initial navigation so subsequent navigations
  // don't accidentally reuse it.
  delete (globalThis as any).__CER_DATA__
}

export { router }
