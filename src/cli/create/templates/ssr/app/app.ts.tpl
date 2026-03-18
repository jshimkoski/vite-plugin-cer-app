import '@jasonshimmy/custom-elements-runtime/css'
import 'virtual:cer-components'
import routes from 'virtual:cer-routes'
import layouts from 'virtual:cer-layouts'
import plugins from 'virtual:cer-plugins'
import { hasLoading, loadingTag } from 'virtual:cer-loading'
import { hasError, errorTag } from 'virtual:cer-error'
import {
  component,
  ref,
  useOnConnected,
  useOnDisconnected,
  registerBuiltinComponents,
} from '@jasonshimmy/custom-elements-runtime'
import { initRouter } from '@jasonshimmy/custom-elements-runtime/router'
import { enableJITCSS } from '@jasonshimmy/custom-elements-runtime/jit-css'
import { createDOMJITCSS } from '@jasonshimmy/custom-elements-runtime/dom-jit-css'

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

component('cer-layout-view', () => {
  const current = ref(router.getCurrent())
  let unsub: (() => void) | undefined
  useOnConnected(() => { unsub = router.subscribe((s: typeof current.value) => { current.value = s }) })
  useOnDisconnected(() => { unsub?.(); unsub = undefined })

  if (currentError.value !== null) {
    if (hasError && errorTag) return { tag: errorTag, props: { attrs: { error: String(currentError.value) } }, children: [] }
    return { tag: 'div', props: { attrs: { style: 'padding:2rem;font-family:monospace' } }, children: [String(currentError.value)] }
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
    await plugin.setup({ router, provide: (key, value) => { (globalThis as any)[key] = value }, config: {} })
  }
}

if (typeof window !== 'undefined') {
  await router.replace(window.location.pathname + window.location.search + window.location.hash)
  createDOMJITCSS().mount()
}

export { router }
