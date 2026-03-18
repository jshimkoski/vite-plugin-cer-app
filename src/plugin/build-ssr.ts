import { build, type UserConfig } from 'vite'
import { join, resolve } from 'pathe'
import { existsSync } from 'node:fs'
import type { ResolvedCerConfig } from './dev-server.js'

/**
 * The server entry template that wires all virtual modules together and
 * exports a request handler for Node.js (Express-compatible).
 */
function generateServerEntryCode(config: ResolvedCerConfig): string {
  return `// AUTO-GENERATED server entry by vite-plugin-cer-app
import 'virtual:cer-components'
import routes from 'virtual:cer-routes'
import layouts from 'virtual:cer-layouts'
import plugins from 'virtual:cer-plugins'
import apiRoutes from 'virtual:cer-server-api'
import { html, registerBuiltinComponents } from '@jasonshimmy/custom-elements-runtime'
import { initRouter } from '@jasonshimmy/custom-elements-runtime/router'
import { createStreamingSSRHandler } from '@jasonshimmy/custom-elements-runtime/ssr-middleware'

registerBuiltinComponents()

// Per-request VNode factory: initialize a fresh router at the request URL,
// resolve the active layout from the matched route's meta, wrap the router-view
// in that layout element, and call the route's data loader so the result is
// serialized as window.__CER_DATA__ for client-side hydration.
//
// createStreamingSSRHandler threads the router through each component's SSR
// context so concurrent renders never share state.
const vnodeFactory = async (req) => {
  const router = initRouter({ routes, initialUrl: req.url ?? '/' })
  const current = router.getCurrent()
  const { route, params } = router.matchRoute(current.path)
  const layoutName = route?.meta?.layout ?? 'default'
  const layoutTag = layouts[layoutName]
  const inner = html\`<router-view></router-view>\`
  const vnode = layoutTag
    ? { tag: layoutTag, props: {}, children: [inner] }
    : inner

  // Call the route's data loader (if present) and serialize for client hydration.
  let head
  if (route?.load) {
    try {
      const mod = await route.load()
      if (typeof mod.loader === 'function') {
        const query = current.query ?? {}
        const data = await mod.loader({ params, query, req })
        if (data !== undefined && data !== null) {
          head = \`<script>window.__CER_DATA__ = \${JSON.stringify(data)}</script>\`
        }
      }
    } catch {
      // Loader errors are non-fatal during SSR; the client will refetch.
    }
  }

  return { vnode, router, head }
}

export const handler = createStreamingSSRHandler(vnodeFactory, {
  render: {
    dsd: ${config.ssr.dsd},
  },
})

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

  // Determine client entry — prefer entry-client.ts, fall back to app.ts
  const clientEntry = existsSync(resolve(config.srcDir, 'entry-client.ts'))
    ? resolve(config.srcDir, 'entry-client.ts')
    : resolve(config.srcDir, 'app.ts')

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

  // Generate server entry source inline via a virtual plugin
  const serverEntryCode = generateServerEntryCode(config)
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
      noExternal: ['@jasonshimmy/custom-elements-runtime'],
    },
  })

  console.log('[cer-app] SSR build complete.')
  console.log(`  Client: ${clientOutDir}`)
  console.log(`  Server: ${serverOutDir}`)
}
