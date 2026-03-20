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
  resolveAppEntry,
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

describe('resolveAppEntry', () => {
  it('returns user app/app.ts when it exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    expect(resolveAppEntry(mockConfig)).toBe(`${ROOT}/app/app.ts`)
  })

  it('returns .cer/app.ts when user app/app.ts is absent', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(resolveAppEntry(mockConfig)).toBe(`${ROOT}/.cer/app.ts`)
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
  it('references /app/app.ts when user entry exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    const html = generateDefaultHtml(mockConfig)
    expect(html).toContain('/app/app.ts')
    expect(html).not.toContain('/.cer/app.ts')
  })

  it('references /.cer/app.ts when user entry is absent', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const html = generateDefaultHtml(mockConfig)
    expect(html).toContain('/.cer/app.ts')
  })

  it('includes <cer-layout-view> mount point', () => {
    const html = generateDefaultHtml(mockConfig)
    expect(html).toContain('<cer-layout-view>')
  })

  it('is valid HTML with doctype', () => {
    const html = generateDefaultHtml(mockConfig)
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

  it('writes .cer/app.ts when app/app.ts does not exist', () => {
    // Only the .cer dir check needs to return true to skip mkdirSync — but we
    // want the user entry check to return false. Use a counter.
    let callCount = 0
    vi.mocked(existsSync).mockImplementation(() => {
      callCount++
      // First call: .cer/ dir → true (already exists, skip mkdir)
      // Second call: app/app.ts → false (absent, write template)
      // Subsequent calls: false (no .gitignore)
      return callCount === 1
    })
    writeGeneratedDir(mockConfig)
    const paths = vi.mocked(writeFileSync).mock.calls.map(([p]) => String(p))
    expect(paths.some(p => p.endsWith('/.cer/app.ts'))).toBe(true)
  })

  it('skips writing .cer/app.ts when app/app.ts exists', () => {
    // existsSync always returns true — dir exists, user entry exists
    vi.mocked(existsSync).mockReturnValue(true)
    writeGeneratedDir(mockConfig)
    const paths = vi.mocked(writeFileSync).mock.calls.map(([p]) => String(p))
    expect(paths.some(p => p.endsWith('/.cer/app.ts'))).toBe(false)
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
