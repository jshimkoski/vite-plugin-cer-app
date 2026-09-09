import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import packageJson from '../../../package.json' with { type: 'json' }
import { createProject } from '../../cli/create/index.js'

const created: string[] = []

afterEach(async () => {
  await Promise.all(created.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })))
})

async function target(name: string) {
  const root = await mkdtemp(join(tmpdir(), `create-cer-app-${name}-`))
  created.push(root)
  return root
}

describe('createProject', () => {
  for (const mode of ['spa', 'ssr', 'ssg'] as const) {
    it(`generates a current, typecheckable ${mode.toUpperCase()} package`, async () => {
      const directory = await target(mode)
      await createProject({ projectName: `test-${mode}`, targetDir: directory, mode })

      const generated = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      expect(generated.devDependencies['@jasonshimmy/vite-plugin-cer-app']).toBe(
        `^${packageJson.version}`,
      )
      expect(generated.scripts.typecheck).toBe('tsc --noEmit')
      expect(generated.scripts.validate).toContain('npm run typecheck')
      expect(JSON.stringify(generated)).not.toContain('{{')
      if (mode === 'ssg') {
        expect(generated.scripts.validate).toContain('cer-app check links')
        const config = await readFile(join(directory, 'cer.config.ts'), 'utf8')
        expect(config).toContain('inlineStylesheets: 20 * 1024')
      }
    })
  }

  it('adds the Material integration without an app-local registration plugin', async () => {
    const directory = await target('material')
    await createProject({
      projectName: 'material-app',
      targetDir: directory,
      mode: 'ssg',
      material: true,
    })

    const generated = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
    const config = await readFile(join(directory, 'cer.config.ts'), 'utf8')
    expect(generated.dependencies['@jasonshimmy/cer-material']).toBeTruthy()
    expect(generated.dependencies['material-symbols']).toBeTruthy()
    expect(config).toContain("import { cerMaterial } from '@jasonshimmy/cer-material/vite'")
    expect(config).toContain('integrations: [cerMaterial()]')
    await expect(readFile(join(directory, 'app/plugins/cer-material.ts'), 'utf8')).rejects.toThrow()
  })

  it('adds a loader-backed content route and starter document', async () => {
    const directory = await target('content')
    await createProject({
      projectName: 'content-app',
      targetDir: directory,
      mode: 'ssg',
      content: true,
    })

    const route = await readFile(join(directory, 'app/pages/[...all].ts'), 'utf8')
    const content = await readFile(join(directory, 'content/getting-started.md'), 'utf8')
    expect(route).toContain('defineContentPageLoader()')
    expect(route).toContain('useContentBreadcrumbs')
    expect(route).toContain('useContentSeo')
    expect(content).toContain('# Getting Started')
  })

  it('adds an opt-in Cypress smoke suite', async () => {
    const directory = await target('tests')
    await createProject({
      projectName: 'tested-app',
      targetDir: directory,
      mode: 'spa',
      tests: true,
    })

    const generated = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
    expect(generated.scripts['test:e2e']).toContain('start-server-and-test')
    expect(generated.devDependencies.cypress).toBeTruthy()
    expect(await readFile(join(directory, 'cypress/e2e/smoke.cy.ts'), 'utf8')).toContain(
      "describe('generated application'",
    )
  })
})
