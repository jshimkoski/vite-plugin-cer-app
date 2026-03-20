import { build, type UserConfig } from 'vite'
import { join, resolve } from 'pathe'
import { existsSync, renameSync } from 'node:fs'
import type { ResolvedCerConfig } from './dev-server.js'
import { getGeneratedDir, writeGeneratedDir } from './generated-dir.js'

/**
 * Resolves the client build entry point for an SSR/SSG build.
 *
 * Priority order:
 * 1. `index.html` at the project root — consumer-provided HTML shell.
 * 2. `.cer/index.html` — auto-generated HTML shell (Nuxt-style magic).
 * 3. `app/entry-client.ts` — fallback for projects that manage HTML externally.
 * 4. `app/app.ts` — last resort (same bundle, no DSD hydration preamble).
 */
export function resolveClientEntry(config: ResolvedCerConfig): string {
  const indexHtml = resolve(config.root, 'index.html')
  if (existsSync(indexHtml)) return indexHtml
  const cerIndexHtml = join(getGeneratedDir(config.root), 'index.html')
  if (existsSync(cerIndexHtml)) return cerIndexHtml
  const entryClient = resolve(config.srcDir, 'entry-client.ts')
  if (existsSync(entryClient)) return entryClient
  return resolve(config.srcDir, 'app.ts')
}

/**
 * The server entry template that wires all virtual modules together and
 * exports a request handler for Node.js (Express-compatible).
 */
function generateServerEntryCode(): string {
  return `// AUTO-GENERATED server entry by @jasonshimmy/vite-plugin-cer-app
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import 'virtual:cer-components'
import routes from 'virtual:cer-routes'
import layouts from 'virtual:cer-layouts'
import plugins from 'virtual:cer-plugins'
import apiRoutes from 'virtual:cer-server-api'
import { registerBuiltinComponents } from '@jasonshimmy/custom-elements-runtime'
import { registerEntityMap, renderToStringWithJITCSSDSD, DSD_POLYFILL_SCRIPT } from '@jasonshimmy/custom-elements-runtime/ssr'
import entitiesJson from '@jasonshimmy/custom-elements-runtime/entities.json'
import { initRouter } from '@jasonshimmy/custom-elements-runtime/router'
import { beginHeadCollection, endHeadCollection, serializeHeadTags } from '@jasonshimmy/vite-plugin-cer-app/composables'

registerBuiltinComponents()

// Pre-load the full HTML entity map so named entities like &mdash; decode
// correctly during SSR. Without this the bundled runtime falls back to a
// minimal set (&lt;, &gt;, &amp; …) and re-escapes everything else.
registerEntityMap(entitiesJson)

// Load the Vite-built client index.html (dist/client/index.html) so every SSR
// response includes the client-side scripts needed for hydration and routing.
// The server bundle lives at dist/server/server.js, so ../client resolves correctly.
const _clientTemplatePath = join(dirname(fileURLToPath(import.meta.url)), '../client/index.html')
const _clientTemplate = existsSync(_clientTemplatePath)
  ? readFileSync(_clientTemplatePath, 'utf-8')
  : null

// Merge the SSR rendered body with the Vite client shell so the final page
// contains both pre-rendered DSD content and the client bundle scripts.
function _mergeWithClientTemplate(ssrHtml, clientTemplate) {
  const headTag = '<head>', headCloseTag = '</head>'
  const bodyTag = '<body>', bodyCloseTag = '</body>'
  const headStart = ssrHtml.indexOf(headTag)
  const headEnd   = ssrHtml.indexOf(headCloseTag)
  const bodyStart = ssrHtml.indexOf(bodyTag)
  const bodyEnd   = ssrHtml.lastIndexOf(bodyCloseTag)
  const ssrHead = headStart >= 0 && headEnd > headStart
    ? ssrHtml.slice(headStart + headTag.length, headEnd).trim() : ''
  const ssrBody = bodyStart >= 0 && bodyEnd > bodyStart
    ? ssrHtml.slice(bodyStart + bodyTag.length, bodyEnd).trim() : ssrHtml
  // Hoist only top-level <style id=...> elements (cer-ssr-jit, cer-ssr-global)
  // from the SSR body into the document <head>. Plain <style> blocks without
  // an id attribute belong to shadow DOM templates and must stay in place —
  // hoisting them to <head> breaks shadow DOM style encapsulation (document
  // styles do not pierce shadow roots), which is the root cause of FOUC.
  const headParts = ssrHead ? [ssrHead] : []
  let ssrBodyContent = ssrBody
  let pos = 0
  while (pos < ssrBodyContent.length) {
    const styleOpen  = ssrBodyContent.indexOf('<style id=', pos)
    if (styleOpen < 0) break
    const styleClose = ssrBodyContent.indexOf('</style>', styleOpen)
    if (styleClose < 0) break
    headParts.push(ssrBodyContent.slice(styleOpen, styleClose + 8))
    ssrBodyContent = ssrBodyContent.slice(0, styleOpen) + ssrBodyContent.slice(styleClose + 8)
    pos = styleOpen
  }
  ssrBodyContent = ssrBodyContent.trim()
  // Inject the pre-rendered layout+page as light DOM of the app mount element
  // so it is visible before JS boots, then the client router takes over.
  let merged = clientTemplate
  if (merged.includes('<cer-layout-view></cer-layout-view>')) {
    merged = merged.replace('<cer-layout-view></cer-layout-view>',
      '<cer-layout-view>' + ssrBodyContent + '</cer-layout-view>')
  } else if (merged.includes('<div id="app"></div>')) {
    merged = merged.replace('<div id="app"></div>',
      '<div id="app">' + ssrBodyContent + '</div>')
  }
  const headAdditions = headParts.filter(Boolean).join('\\n')
  if (headAdditions) {
    // If SSR provides a <title>, replace the client template's <title> so the
    // SSR title wins (client template title is the fallback default).
    if (headAdditions.includes('<title>')) {
      merged = merged.replace(/<title>[^<]*<\\/title>/, '')
    }
    merged = merged.replace('</head>', headAdditions + '\\n</head>')
  }
  return merged
}

// Per-request async setup: initialize a fresh router, resolve the matched
// route and layout, pre-load the page module, and call the data loader.
// Returns the vnode tree, router, head additions, and the raw loader data.
//
// loaderData is returned (not set on globalThis) so the handler can assign it
// synchronously right before renderToStringWithJITCSS — guaranteeing that
// concurrent renders (SSG concurrency > 1) never race on a shared global.
const _prepareRequest = async (req) => {
  const router = initRouter({ routes, initialUrl: req.url ?? '/' })
  const current = router.getCurrent()
  const { route, params } = router.matchRoute(current.path)
  const layoutName = route?.meta?.layout ?? 'default'
  const layoutTag = layouts[layoutName]

  // Pre-load the page module so we can embed the component tag directly.
  // This avoids the async router-view (which injects content via script tags
  // and breaks Declarative Shadow DOM on initial parse).
  let pageVnode = { tag: 'div', props: {}, children: [] }
  let head
  let loaderData = null
  if (route?.load) {
    try {
      const mod = await route.load()
      const pageTag = mod.default
      if (pageTag) {
        pageVnode = { tag: pageTag, props: { attrs: { ...params } }, children: [] }
      }
      if (typeof mod.loader === 'function') {
        const query = current.query ?? {}
        const data = await mod.loader({ params, query, req })
        if (data !== undefined && data !== null) {
          loaderData = data
          head = \`<script>window.__CER_DATA__ = \${JSON.stringify(data)}</script>\`
        }
      }
    } catch {
      // Non-fatal: loader errors fall back to an empty page; client will refetch.
    }
  }

  const vnode = layoutTag
    ? { tag: layoutTag, props: {}, children: [pageVnode] }
    : pageVnode

  return { vnode, router, head, loaderData }
}

export const handler = async (req, res) => {
  const { vnode, router, head, loaderData } = await _prepareRequest(req)

  // Set loader data on globalThis synchronously before the render so
  // usePageData() can read it. Because renderToStringWithJITCSSDSD is entirely
  // synchronous and JavaScript is single-threaded, no concurrent request can
  // overwrite __CER_DATA__ between this assignment and the read inside setup().
  if (loaderData !== null) {
    ;(globalThis).__CER_DATA__ = loaderData
  }

  // Begin collecting useHead() calls made during the synchronous render pass.
  beginHeadCollection()

  // dsdPolyfill: false — we inject the polyfill manually after merging so it
  // lands at the end of <body>, not inside <cer-layout-view> light DOM where
  // scripts may not execute.
  const { htmlWithStyles } = renderToStringWithJITCSSDSD(vnode, {
    dsdPolyfill: false,
    router,
  })

  // Collect and serialize any useHead() calls from the rendered components.
  const headTags = serializeHeadTags(endHeadCollection())

  // Clear immediately after the synchronous render so the value never leaks
  // to the next request on this same server process.
  delete (globalThis).__CER_DATA__

  // Merge loader data script + useHead() tags into the document head.
  const headContent = [head, headTags].filter(Boolean).join('\\n')

  // Wrap the rendered body in a full HTML document and inject the head additions
  // (loader data script, useHead() tags, JIT styles). No polyfill in body yet.
  const ssrHtml = \`<!DOCTYPE html><html><head>\${headContent}</head><body>\${htmlWithStyles}</body></html>\`

  let finalHtml = _clientTemplate
    ? _mergeWithClientTemplate(ssrHtml, _clientTemplate)
    : ssrHtml

  // Inject DSD polyfill at end of <body>, outside <cer-layout-view>, so the
  // browser runs it after parsing the declarative shadow roots.
  finalHtml = finalHtml.includes('</body>')
    ? finalHtml.replace('</body>', DSD_POLYFILL_SCRIPT + '</body>')
    : finalHtml + DSD_POLYFILL_SCRIPT

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(finalHtml)
}

export { apiRoutes, plugins, layouts }
export default handler
`
}

/**
 * Runs the dual (client + server) SSR build using Vite's programmatic API.
 *
 * 1. Client bundle: normal Vite build (outputs to dist/client)
 * 2. Server bundle: SSR build (outputs to dist/server), uses a generated entry
 */
export async function buildSSR(
  config: ResolvedCerConfig,
  viteUserConfig: UserConfig = {},
): Promise<void> {
  const clientOutDir = join(config.root, 'dist/client')
  const serverOutDir = join(config.root, 'dist/server')

  // Write .cer/ generated files BEFORE resolving the client entry so that
  // .cer/index.html is on disk when resolveClientEntry checks for it.
  writeGeneratedDir(config)

  // Resolve the client entry — index.html is preferred so Vite writes a
  // processed index.html to dist/client/ for use as the SSG shell template.
  const clientEntry = resolveClientEntry(config)

  // Build the client bundle
  console.log('[cer-app] Building client bundle...')
  await build({
    ...viteUserConfig,
    root: config.root,
    build: {
      ...viteUserConfig.build,
      outDir: clientOutDir,
      ssrManifest: true,
      rollupOptions: {
        input: clientEntry,
      },
    },
  })

  // If the client entry was .cer/index.html, Vite outputs it as
  // dist/client/.cer/index.html (preserving relative path). The SSR server
  // template expects dist/client/index.html, so rename it into place.
  const generatedHtmlOut = join(clientOutDir, '.cer/index.html')
  const rootHtmlOut = join(clientOutDir, 'index.html')
  if (existsSync(generatedHtmlOut) && !existsSync(rootHtmlOut)) {
    renameSync(generatedHtmlOut, rootHtmlOut)
  }

  // Generate server entry source inline via a virtual plugin
  const serverEntryCode = generateServerEntryCode()
  const VIRTUAL_SERVER_ENTRY = 'virtual:cer-server-entry'
  const RESOLVED_SERVER_ENTRY = '\0virtual:cer-server-entry'

  // Build the server (SSR) bundle
  console.log('[cer-app] Building server bundle...')
  await build({
    ...viteUserConfig,
    root: config.root,
    plugins: [
      ...(viteUserConfig.plugins ?? []),
      {
        name: 'vite-plugin-cer-server-entry',
        enforce: 'pre' as const,
        resolveId(id: string) {
          if (id === VIRTUAL_SERVER_ENTRY) return RESOLVED_SERVER_ENTRY
        },
        load(id: string) {
          if (id === RESOLVED_SERVER_ENTRY) return serverEntryCode
        },
      },
    ],
    build: {
      ...viteUserConfig.build,
      outDir: serverOutDir,
      ssr: true,
      rollupOptions: {
        input: VIRTUAL_SERVER_ENTRY,
        output: {
          entryFileNames: 'server.js',
        },
      },
    },
    ssr: {
      noExternal: ['@jasonshimmy/custom-elements-runtime', '@jasonshimmy/vite-plugin-cer-app'],
    },
  })

  console.log('[cer-app] SSR build complete.')
  console.log(`  Client: ${clientOutDir}`)
  console.log(`  Server: ${serverOutDir}`)
}
