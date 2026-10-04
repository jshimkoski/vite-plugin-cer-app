import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { scanFiles } from '../../plugin/file-scanner.js'
import { scanContentFiles } from '../../plugin/content/scanner.js'

describe('source file discovery', () => {
  let root: string
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'cer-files-')) })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  it('returns only matching files, excluding hidden and dependency directories', async () => {
    for (const dir of ['nested', 'node_modules/pkg', '.git', '.hidden', 'directory.ts']) {
      await mkdir(join(root, dir), { recursive: true })
    }
    for (const file of ['page.ts', 'nested/[slug].ts', 'nested/[...all].ts', 'page.js', '.secret.ts',
      'node_modules/pkg/page.ts', '.git/page.ts', '.hidden/page.ts']) {
      await writeFile(join(root, file), '')
    }
    expect(await scanFiles(root, ['.ts'])).toEqual([
      join(root, 'nested/[...all].ts'), join(root, 'nested/[slug].ts'), join(root, 'page.ts'),
    ])
  })

  it('discovers Markdown and JSON content with correct extension metadata', async () => {
    await mkdir(join(root, 'docs'))
    for (const file of ['docs/guide.md', 'data.json', 'ignored.ts', '.hidden.md']) {
      await writeFile(join(root, file), '')
    }
    expect(await scanContentFiles(root)).toEqual([
      { filePath: join(root, 'data.json'), ext: 'json' },
      { filePath: join(root, 'docs/guide.md'), ext: 'md' },
    ])
  })

  it('follows file and directory symlinks without recursing through cycles', async () => {
    await mkdir(join(root, 'pages'))
    await writeFile(join(root, 'pages/page.ts'), '')
    await symlink(join(root, 'pages'), join(root, 'alias'), 'dir')
    await symlink(root, join(root, 'pages/cycle'), 'dir')
    await symlink(join(root, 'pages/page.ts'), join(root, 'linked.ts'), 'file')
    await symlink(join(root, 'missing.ts'), join(root, 'broken.ts'), 'file')
    expect(await scanFiles(root, ['.ts'])).toEqual([
      join(root, 'alias/page.ts'), join(root, 'linked.ts'), join(root, 'pages/page.ts'),
    ])
  })

  it('returns no matches for missing directories', async () => {
    expect(await scanFiles(join(root, 'missing'), ['.ts'])).toEqual([])
  })

  it('lets SSG retain discovery inside non-hidden dependency directories', async () => {
    await mkdir(join(root, 'node_modules'), { recursive: true })
    await writeFile(join(root, 'node_modules/page.ts'), '')
    expect(await scanFiles(root, ['.ts'], [])).toEqual([join(root, 'node_modules/page.ts')])
  })
})
