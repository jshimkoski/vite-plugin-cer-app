import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(''),
    appendFileSync: vi.fn(),
  }
})
vi.mock('../../runtime/app-template.js', () => ({ APP_ENTRY_TEMPLATE: '// app template' }))

import { existsSync, writeFileSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs'
import {
  GENERATED_DIR_NAME,
  getGeneratedDir,
  resolveHtmlEntry,
  generateDefaultHtml,
  writeGeneratedDir,
} from '../../plugin/generated-dir.js'

const ROOT = '/project'
const mockConfig = {
  root: ROOT,
  srcDir: `${ROOT}/app`,
} as Parameters<typeof writeGeneratedDir>[0]

beforeEach(() => {
  vi.mocked(existsSync).mockReturnValue(false)
  vi.mocked(writeFileSync).mockClear()
  vi.mocked(mkdirSync).mockClear()
  vi.mocked(readFileSync).mockReturnValue('')
  vi.mocked(appendFileSync).mockClear()
})

describe('GENERATED_DIR_NAME', () => {
  it('is .cer', () => {
    expect(GENERATED_DIR_NAME).toBe('.cer')
  })
})

describe('getGeneratedDir', () => {
  it('returns <root>/.cer', () => {
    expect(getGeneratedDir(ROOT)).toBe(`${ROOT}/.cer`)
  })
})

describe('resolveHtmlEntry', () => {
  it('returns user index.html when it exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    expect(resolveHtmlEntry(mockConfig)).toBe(`${ROOT}/index.html`)
  })

  it('returns .cer/index.html when user index.html is absent', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(resolveHtmlEntry(mockConfig)).toBe(`${ROOT}/.cer/index.html`)
  })
})

describe('generateDefaultHtml', () => {
  it('always references /@cer/app.ts', () => {
    const html = generateDefaultHtml()
    expect(html).toContain('/@cer/app.ts')
    expect(html).not.toContain('/app/app.ts')
  })

  it('includes <cer-layout-view> mount point', () => {
    const html = generateDefaultHtml()
    expect(html).toContain('<cer-layout-view>')
  })

  it('is valid HTML with doctype', () => {
    const html = generateDefaultHtml()
    expect(html).toContain('<!DOCTYPE html>')
  })
})

describe('writeGeneratedDir', () => {
  it('creates the .cer directory when absent', () => {
    // existsSync returns false for everything → dir is created
    writeGeneratedDir(mockConfig)
    expect(mkdirSync).toHaveBeenCalledWith(`${ROOT}/.cer`, { recursive: true })
  })

  it('does not re-create the directory when it already exists', () => {
    // existsSync returns true → dir already present
    vi.mocked(existsSync).mockReturnValue(true)
    writeGeneratedDir(mockConfig)
    expect(mkdirSync).not.toHaveBeenCalled()
  })

  it('always writes .cer/app.ts', () => {
    writeGeneratedDir(mockConfig)
    const paths = vi.mocked(writeFileSync).mock.calls.map(([p]) => String(p))
    expect(paths.some(p => p.endsWith('/.cer/app.ts'))).toBe(true)
  })

  it('always writes .cer/app.ts even when .cer/ dir already exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    writeGeneratedDir(mockConfig)
    const paths = vi.mocked(writeFileSync).mock.calls.map(([p]) => String(p))
    expect(paths.some(p => p.endsWith('/.cer/app.ts'))).toBe(true)
  })

  it('always writes .cer/index.html', () => {
    writeGeneratedDir(mockConfig)
    const paths = vi.mocked(writeFileSync).mock.calls.map(([p]) => String(p))
    expect(paths.some(p => p.endsWith('/.cer/index.html'))).toBe(true)
  })

  it('creates .gitignore when absent', () => {
    // existsSync returns false → .cer/ dir created, app.ts written, .gitignore created
    writeGeneratedDir(mockConfig)
    const paths = vi.mocked(writeFileSync).mock.calls.map(([p]) => String(p))
    expect(paths.some(p => p.endsWith('/.gitignore'))).toBe(true)
  })

  it('appends .cer/ to existing .gitignore that does not contain it', () => {
    // .gitignore exists (readFileSync returns '' — no .cer/ entry)
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.gitignore'))
    vi.mocked(readFileSync).mockReturnValue('node_modules/\ndist/\n')
    writeGeneratedDir(mockConfig)
    expect(appendFileSync).toHaveBeenCalled()
    const appendArg = vi.mocked(appendFileSync).mock.calls[0][1] as string
    expect(appendArg).toContain('.cer/')
  })

  it('does not append to .gitignore when .cer/ is already present', () => {
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('.gitignore'))
    vi.mocked(readFileSync).mockReturnValue('node_modules/\n.cer/\ndist/\n')
    writeGeneratedDir(mockConfig)
    expect(appendFileSync).not.toHaveBeenCalled()
  })
})
