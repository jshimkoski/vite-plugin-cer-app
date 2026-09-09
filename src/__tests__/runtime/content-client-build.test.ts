import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { build } from 'vite'

describe('content client browser bundle', () => {
  let outputDir = ''

  afterEach(async () => {
    if (outputDir) await rm(outputDir, { recursive: true, force: true })
  })

  it('tree-shakes Node.js filesystem fallbacks from browser builds', async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'cer-content-client-'))

    await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        emptyOutDir: true,
        minify: false,
        outDir: outputDir,
        lib: {
          entry: resolve('src/runtime/content/client.ts'),
          formats: ['es'],
          fileName: () => 'content-client.js',
        },
      },
    })

    const files = await readdir(outputDir)
    const javascript = (
      await Promise.all(
        files
          .filter((file) => file.endsWith('.js'))
          .map((file) => readFile(join(outputDir, file), 'utf8')),
      )
    ).join('\n')

    expect(files.some((file) => file.includes('browser-external'))).toBe(false)
    expect(javascript).not.toMatch(/(?:import|from)\s*\(?["']node:(?:fs|path)/)
  })
})
