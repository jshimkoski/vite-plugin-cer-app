import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { inlineStylesheetLinks, loadClientStylesheet } from '../../plugin/build-ssg.js'

describe('inlineStylesheetLinks', () => {
  it('inlines same-origin stylesheets that fit within the byte budget', async () => {
    const load = vi.fn(async (href: string) => href === '/assets/app.css' ? 'body{color:red}' : null)
    const html = '<html><head><link rel="stylesheet" href="/assets/app.css"></head></html>'

    const result = await inlineStylesheetLinks(html, 100, load)

    expect(result).toContain('<style data-cer-inline-source="/assets/app.css">body{color:red}</style>')
    expect(result).not.toContain('<link rel="stylesheet"')
    expect(load).toHaveBeenCalledOnce()
  })

  it('recognizes rel and href attributes regardless of their order or quoting', async () => {
    const load = vi.fn(async () => '.app{display:block}')
    const html = "<link href='/assets/app.css' media=screen rel='stylesheet'>"

    const result = await inlineStylesheetLinks(html, 100, load)

    expect(result).toContain('<style media="screen" data-cer-inline-source="/assets/app.css">')
  })

  it('does not terminate a link tag at a greater-than sign inside a quoted attribute', async () => {
    const html = '<link data-label="a>b" rel="stylesheet" href="/assets/app.css">'

    const result = await inlineStylesheetLinks(html, 100, async () => 'body{}')

    expect(result).toContain('data-label="a&gt;b"')
    expect(result).toContain('data-cer-inline-source="/assets/app.css"')
    expect(result).not.toContain('<link')
  })

  it('does not rewrite link-like text inside comments, scripts, or styles', async () => {
    const ignored = '<link rel="stylesheet" href="/assets/ignored.css">'
    const real = '<link rel="stylesheet" href="/assets/app.css">'
    const html = `<!-- ${ignored} --><script>const tag = '${ignored}'</script><style>${ignored}</style>${real}`
    const load = vi.fn(async () => 'body{}')

    const result = await inlineStylesheetLinks(html, 100, load)

    expect(result.match(/data-cer-inline-source/g)).toHaveLength(1)
    expect(result).toContain(`<!-- ${ignored} -->`)
    expect(load).toHaveBeenCalledOnce()
    expect(load).toHaveBeenCalledWith('/assets/app.css')
  })

  it('loads a repeated stylesheet once while replacing every link', async () => {
    const load = vi.fn(async () => 'body{}')
    const html = [
      '<link rel="stylesheet" href="/assets/app.css">',
      '<link href="/assets/app.css" rel="stylesheet">',
    ].join('')

    const result = await inlineStylesheetLinks(html, 100, load)

    expect(result.match(/data-cer-inline-source/g)).toHaveLength(2)
    expect(load).toHaveBeenCalledOnce()
  })

  it('preserves oversized and cross-origin stylesheets', async () => {
    const load = vi.fn(async () => 'body{color:red}')
    const local = '<link rel="stylesheet" href="/assets/app.css">'
    const remote = '<link rel="stylesheet" href="https://cdn.example.com/app.css">'

    const result = await inlineStylesheetLinks(local + remote, 4, load)

    expect(result).toBe(local + remote)
    expect(load).toHaveBeenCalledOnce()
  })

  it('preserves links when the stylesheet cannot be loaded', async () => {
    const link = '<link rel="stylesheet" href="/assets/missing.css">'
    const result = await inlineStylesheetLinks(link, 100, async () => null)

    expect(result).toBe(link)
  })

  it('neutralizes closing style tags in CSS', async () => {
    const result = await inlineStylesheetLinks(
      '<link rel="stylesheet" href="/assets/app.css">',
      100,
      async () => 'x::after{content:"</style>"}',
    )

    expect(result).toContain('<\\/style>')
    expect(result).not.toContain('content:"</style>"')
  })
})

describe('loadClientStylesheet', () => {
  it('loads a client asset while ignoring its URL query and fragment', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cer-inline-css-'))
    try {
      await mkdir(join(root, 'assets'))
      await writeFile(join(root, 'assets', 'app.css'), 'body{}', 'utf-8')

      await expect(loadClientStylesheet(root, '/assets/app.css?v=1#top')).resolves.toBe('body{}')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects decoded traversal, backslash, and malformed URLs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cer-inline-css-'))
    try {
      await expect(loadClientStylesheet(root, '/../secret.css')).resolves.toBeNull()
      await expect(loadClientStylesheet(root, '/%2e%2e/secret.css')).resolves.toBeNull()
      await expect(loadClientStylesheet(root, '/assets%5Csecret.css')).resolves.toBeNull()
      await expect(loadClientStylesheet(root, '/%zz.css')).resolves.toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
