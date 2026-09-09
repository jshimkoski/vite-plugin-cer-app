import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkBuiltLinks } from '../../cli/checks/links.js'
import { checkPerformanceBudgets } from '../../cli/checks/performance.js'

const roots: string[] = []

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cer-check-'))
  roots.push(root)
  const dist = join(root, 'dist')
  await mkdir(join(dist, 'docs'), { recursive: true })
  await mkdir(join(dist, 'assets'), { recursive: true })
  return { root, dist }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('checkBuiltLinks', () => {
  it('validates routes and decoded fragments across generated pages', async () => {
    const { dist } = await fixture()
    await writeFile(join(dist, 'index.html'), '<a href="/docs/#install%20now">Docs</a>')
    await writeFile(join(dist, 'docs/index.html'), '<h2 id="install now">Install</h2>')

    await expect(checkBuiltLinks({ outputDir: dist })).resolves.toEqual({
      pages: 2,
      links: 1,
      failures: [],
    })
  })

  it('reports missing routes and fragments without terminating the process', async () => {
    const { dist } = await fixture()
    await writeFile(
      join(dist, 'index.html'),
      '<a href="/missing">Missing</a><a href="/docs/#missing">Fragment</a>',
    )
    await writeFile(join(dist, 'docs/index.html'), '<h2 id="present">Present</h2>')

    const report = await checkBuiltLinks({ outputDir: dist })
    expect(report.failures).toHaveLength(2)
    expect(report.failures.join('\n')).toContain('missing')
  })
})

describe('checkPerformanceBudgets', () => {
  it('measures HTML and linked initial JavaScript with configurable budgets', async () => {
    const { dist } = await fixture()
    await writeFile(
      join(dist, 'index.html'),
      '<script type="module" src="/assets/index-123.js"></script>',
    )
    await writeFile(join(dist, 'assets/index-123.js'), 'console.log("small")')

    const report = await checkPerformanceBudgets({
      outputDir: dist,
      maxHtmlBytes: 1_000,
      maxInitialJsGzipBytes: 1_000,
      maxEntryJsGzipBytes: 1_000,
    })
    expect(report.failures).toEqual([])
    expect(report.initialJsGzipBytes).toBeGreaterThan(0)
  })

  it('reports browser external shims and exceeded budgets', async () => {
    const { dist } = await fixture()
    await writeFile(
      join(dist, 'index.html'),
      '<script type="module" src="/assets/index-large.js"></script>',
    )
    await writeFile(join(dist, 'assets/index-large.js'), 'x'.repeat(5_000))
    await writeFile(join(dist, 'assets/__vite-browser-external.js'), '')

    const report = await checkPerformanceBudgets({
      outputDir: dist,
      maxHtmlBytes: 10,
      maxInitialJsGzipBytes: 10,
      maxEntryJsGzipBytes: 10,
    })
    expect(report.failures.join('\n')).toContain('homepage')
    expect(report.failures.join('\n')).toContain('initial JavaScript')
    expect(report.failures.join('\n')).toContain('browser-external')
  })
})
