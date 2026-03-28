import { build, type UserConfig } from 'vite'
import { join, resolve } from 'pathe'
import { existsSync, renameSync } from 'node:fs'
import type { ResolvedCerConfig } from './dev-server.js'
import { getGeneratedDir, writeGeneratedDir } from './generated-dir.js'
import { ENTRY_SERVER_TEMPLATE } from '../runtime/entry-server-template.js'

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

function generateServerEntryCode(): string {
  return ENTRY_SERVER_TEMPLATE
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
      // Keep vite-plugin-cer-app inlined so its virtual-module composables
      // (useRoute, useState, useFetch, etc.) are available in the server bundle.
      //
      // Do NOT add @jasonshimmy/custom-elements-runtime here. Inlining it
      // creates a second, isolated copy of the component registry (the module-
      // level Map in namespace-helpers). Third-party CER component libraries
      // (e.g. @jasonshimmy/cer-material) are external and resolve the runtime
      // from node_modules at runtime, giving them a *different* Map instance.
      // That means components registered by plugins never appear in the
      // renderer's registry → renderToStreamWithJITCSSDSD emits bare stubs
      // with no DSD → FOUC when the browser upgrades those elements.
      //
      // By keeping the runtime external both the server bundle and all
      // third-party plugins resolve it from node_modules at runtime, sharing
      // one Map and one registry, so DSD is generated for all registered
      // components regardless of which package called component().
      noExternal: ['@jasonshimmy/vite-plugin-cer-app'],
    },
  })

  console.log('[cer-app] SSR build complete.')
  console.log(`  Client: ${clientOutDir}`)
  console.log(`  Server: ${serverOutDir}`)
}
