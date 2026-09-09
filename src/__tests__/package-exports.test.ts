import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface ConditionalExport {
  import?: string
  require?: string
  types?: string
}

interface PackageManifest {
  main?: string
  files?: string[]
  scripts?: Record<string, string>
  exports: Record<string, ConditionalExport | string>
}

describe('published package entry points', () => {
  it('does not advertise CommonJS files that the TypeScript build never emits', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as PackageManifest

    expect(manifest.main).toBe('dist/index.js')
    for (const entry of Object.values(manifest.exports)) {
      if (typeof entry === 'object') expect(entry.require).toBeUndefined()
    }
  })

  it('publishes only built artifacts and cleans stale output before building', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as PackageManifest

    expect(manifest.files).toEqual(['dist'])
    expect(manifest.scripts?.prebuild).toBe('node scripts/clean-dist.mjs')
    expect(manifest.scripts?.build).toBe(
      'tsc -p tsconfig.build.json && node scripts/copy-templates.mjs',
    )

    const finalizeBuild = readFileSync(
      new URL('../../scripts/copy-templates.mjs', import.meta.url),
      'utf8',
    )
    expect(finalizeBuild).toContain("chmod(new URL('../dist/cli/index.js'")
    expect(finalizeBuild).toContain("chmod(new URL('../dist/cli/create/index.js'")
  })
})
