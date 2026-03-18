/**
 * Template string for `app/app.ts`.
 *
 * This file is the main application bootstrap entry point.
 * It registers all auto-discovered components, initialises the router,
 * runs plugins, and registers the framework-level <cer-layout-view> component
 * that handles layout selection, loading indicators, and error pages.
 */
export const APP_TEMPLATE = `import '@jasonshimmy/custom-elements-runtime/css'
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

// Enable JIT CSS globally for all Shadow DOM components.
enableJITCSS()

// initRouter registers router-view/router-link, creates the router, and sets it as active.
const router = initRouter({ routes })

// ─── Navigation state ────────────────────────────────────────────────────────

// isNavigating becomes true while a lazy route chunk is loading.
const isNavigating = ref(false)

// currentError holds the last uncaught navigation or render error.
const currentError = ref(null)

// Expose resetError globally so page-error components can call it.
;(globalThis as any).resetError = () => {
  currentError.value = null
  router.replace(router.getCurrent().path)
}

// Wrap push/replace to track navigation pending state.
const _push = router.push.bind(router)
const _replace = router.replace.bind(router)

router.push = async (path) => {
  isNavigating.value = true
  currentError.value = null
  try {
    await _push(path)
  } catch (err) {
    currentError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isNavigating.value = false
  }
}

router.replace = async (path) => {
  isNavigating.value = true
  currentError.value = null
  try {
    await _replace(path)
  } catch (err) {
    currentError.value = err instanceof Error ? err.message : String(err)
  } finally {
    isNavigating.value = false
  }
}

// ─── <cer-layout-view> ───────────────────────────────────────────────────────
//
// Wraps <router-view> in the layout appropriate for the current route.
// Falls back to rendering <router-view> directly when no matching layout
// exists. Also renders loading / error pages when those states are active.
//
// Layout stays mounted across navigations that share the same layout — the
// vdom diff preserves the outer element when its tag name doesn't change.

component('cer-layout-view', () => {
  const current = ref(router.getCurrent())
  let unsub: (() => void) | undefined

  useOnConnected(() => {
    unsub = router.subscribe((s: typeof current.value) => {
      current.value = s
    })
  })

  useOnDisconnected(() => {
    unsub?.()
    unsub = undefined
  })

  // Error state — show page-error if available, otherwise plain text.
  if (currentError.value !== null) {
    if (hasError && errorTag) {
      return { tag: errorTag, props: { attrs: { error: String(currentError.value) } }, children: [] }
    }
    return { tag: 'div', props: { attrs: { style: 'padding:2rem;font-family:monospace' } }, children: [String(currentError.value)] }
  }

  // Loading state — show page-loading while a route chunk is fetching.
  if (isNavigating.value && hasLoading && loadingTag) {
    return { tag: loadingTag, props: {}, children: [] }
  }

  // Normal state — wrap router-view in the active layout (if any).
  const matched = router.matchRoute(current.value.path)
  const layoutName = (matched?.route as any)?.meta?.layout ?? 'default'
  const layoutTag = (layouts as Record<string, string>)[layoutName]
  const routerView = { tag: 'router-view', props: {}, children: [] }

  if (layoutTag) {
    return { tag: layoutTag, props: {}, children: [routerView] }
  }
  return routerView
})

// ─── Plugins ─────────────────────────────────────────────────────────────────

for (const plugin of plugins) {
  if (plugin && typeof plugin.setup === 'function') {
    await plugin.setup({ router, provide: (key, value) => { (globalThis as any)[key] = value }, config: {} })
  }
}

// ─── Initial navigation ──────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  await router.replace(window.location.pathname + window.location.search + window.location.hash)
  createDOMJITCSS().mount()
}

export { router }
`
