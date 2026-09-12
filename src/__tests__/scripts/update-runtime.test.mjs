import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseArguments,
  updateRuntimeReferences,
} from '../../../scripts/update-runtime.mjs'

const runtimePackage = '@jasonshimmy/custom-elements-runtime'
const created = []
const release = {
  version: '4.2.3',
  tarball:
    'https://registry.npmjs.org/@jasonshimmy/custom-elements-runtime/-/custom-elements-runtime-4.2.3.tgz',
  integrity: 'sha512-test-integrity',
  license: 'MIT',
  dependencies: {},
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'cer-runtime-update-'))
  created.push(root)
  const templatePaths = [
    join(root, 'src/cli/create/templates/spa/package.json.tpl'),
    join(root, 'src/cli/create/templates/nested/ssr/package.json.tpl'),
  ]
  await Promise.all(templatePaths.map((path) => mkdir(join(path, '..'), { recursive: true })))
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      peerDependencies: { [runtimePackage]: '>=3.9.1', vite: '>=5.0.0' },
      devDependencies: { [runtimePackage]: '^3.9.1', vitest: '^5.0.0' },
    }),
  )
  await writeFile(
    join(root, 'package-lock.json'),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {
          peerDependencies: { [runtimePackage]: '>=3.9.1' },
          devDependencies: { [runtimePackage]: '^3.9.1' },
        },
        [`node_modules/${runtimePackage}`]: {
          version: '3.9.1',
          resolved: 'https://registry.npmjs.org/old.tgz',
          integrity: 'sha512-old',
          dev: true,
          license: 'MIT',
        },
      },
    }),
  )
  await Promise.all(
    templatePaths.map((path) =>
      writeFile(
        path,
        JSON.stringify({
          dependencies: { [runtimePackage]: '^3.9.1' },
          devDependencies: { '@jasonshimmy/vite-plugin-cer-app': '^{{pluginVersion}}' },
        }),
      ),
    ),
  )
  return { root, templatePaths }
}

describe('runtime dependency updater', () => {
  it('discovers templates recursively and updates every runtime reference', async () => {
    const { root, templatePaths } = await createFixture()
    const result = await updateRuntimeReferences({ root, release, checkOnly: false })

    expect(result.changed).toHaveLength(4)
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
    expect(manifest.peerDependencies[runtimePackage]).toBe('>=4.2.3')
    expect(manifest.devDependencies[runtimePackage]).toBe('^4.2.3')
    expect(lock.packages[''].peerDependencies[runtimePackage]).toBe('>=4.2.3')
    expect(lock.packages[`node_modules/${runtimePackage}`]).toMatchObject({
      version: '4.2.3',
      resolved: release.tarball,
      integrity: release.integrity,
    })
    for (const path of templatePaths) {
      const template = JSON.parse(await readFile(path, 'utf8'))
      expect(template.dependencies[runtimePackage]).toBe('^4.2.3')
      expect(template.devDependencies['@jasonshimmy/vite-plugin-cer-app']).toBe(
        '^{{pluginVersion}}',
      )
    }
  })

  it('reports stale files without changing them in check mode', async () => {
    const { root } = await createFixture()
    const before = await readFile(join(root, 'package.json'), 'utf8')
    const result = await updateRuntimeReferences({ root, release, checkOnly: true })

    expect(result.changed).toHaveLength(4)
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(before)
  })

  it('fails before writing when a required dependency declaration is missing', async () => {
    const { root } = await createFixture()
    const path = join(root, 'package.json')
    const before = await readFile(path, 'utf8')
    await writeFile(path, JSON.stringify({ peerDependencies: {}, devDependencies: {} }))
    const invalid = await readFile(path, 'utf8')

    await expect(updateRuntimeReferences({ root, release, checkOnly: false })).rejects.toThrow(
      `package.json.peerDependencies must declare ${runtimePackage}`,
    )
    expect(await readFile(path, 'utf8')).toBe(invalid)
    expect(before).not.toBe(invalid)
  })

  it('rejects non-zero-dependency releases and invalid CLI arguments', async () => {
    const { root } = await createFixture()
    await expect(
      updateRuntimeReferences({
        root,
        release: { ...release, dependencies: { surprise: '^1.0.0' } },
        checkOnly: false,
      }),
    ).rejects.toThrow('is not zero-dependency')
    expect(() => parseArguments(['--version'])).toThrow('--version requires a value')
    expect(() => parseArguments(['--unknown'])).toThrow('Unknown argument')
    expect(parseArguments(['--check', '--version', '4.2.3'])).toEqual({
      help: false,
      checkOnly: true,
      version: '4.2.3',
    })
  })
})
