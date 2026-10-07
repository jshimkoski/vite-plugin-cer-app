import { resolve } from 'pathe'
import { pathToFileURL } from 'node:url'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import type { CerAppConfig } from '../types/config.js'

export async function loadCerConfig(root: string): Promise<CerAppConfig> {
  const configPath = resolve(root, 'cer.config.ts')
  const configPathJs = resolve(root, 'cer.config.js')

  const filePath = existsSync(configPath)
    ? configPath
    : existsSync(configPathJs)
      ? configPathJs
      : null

  if (!filePath) {
    console.warn('[cer-app] No cer.config.ts found; using defaults.')
    return {}
  }

  try {
    const originalNodeEnv = process.env.NODE_ENV
    const originalMode = process.env.MODE
    // Bootstrap .cer/tsconfig.json so rolldown can resolve it during cer.config.ts transform
    const cerDir = resolve(root, '.cer')
    const cerTsconfig = resolve(cerDir, 'tsconfig.json')
    if (!existsSync(cerTsconfig)) {
      mkdirSync(cerDir, { recursive: true })
      writeFileSync(cerTsconfig, '{"compilerOptions":{}}\n', 'utf-8')
    }

    // Use Vite's build to transpile TS config at runtime
    try {
      const { build } = await import('vite')
      await build({
        root, configFile: false, publicDir: false,
        build: {
          lib: {
            entry: filePath,
            formats: ['es'],
            fileName: () => 'cer.config.mjs',
          },
          outDir: resolve(root, 'node_modules/.cer-app-cache'),
          write: true,
          rollupOptions: {
            // Externalize all bare package imports (handles file: symlinks too)
            external: (id: string) => !id.startsWith('.') && !id.startsWith('/'),
          },
        },
        logLevel: 'silent',
      })
    } finally {
      if (typeof originalNodeEnv === 'undefined') delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalNodeEnv
      if (typeof originalMode === 'undefined') delete process.env.MODE
      else process.env.MODE = originalMode
    }

    const outFile = resolve(root, 'node_modules/.cer-app-cache/cer.config.mjs')
    if (existsSync(outFile)) {
      const mod = await import(pathToFileURL(outFile).href + `?t=${Date.now()}`)
      return mod.default ?? {}
    }
  } catch (cause) {
    throw new Error(`[cer-app] Failed to load ${filePath}`, { cause })
  }
  throw new Error(`[cer-app] Config build produced no module for ${filePath}`)
}
