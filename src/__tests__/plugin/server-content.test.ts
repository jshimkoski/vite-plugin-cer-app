import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { serverContentSource } from '../../plugin/server-content.js'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cer-server-content-')); roots.push(root)
  mkdirSync(join(root, '_content/docs'), { recursive: true })
  return root
}
it('embeds full published documents in a portable server snapshot with arbitrary JSON keys intact', () => {
  const root = fixture()
  writeFileSync(join(root, '_content/manifest.json'), '[{"_path":"/docs/guide"}]')
  const json = '{"_path":"/docs/guide","title":"Guide","body":"<h1>Body</h1>","__proto__":{"extra":"Content key"}}'
  writeFileSync(join(root, '_content/docs/guide.json'), json)
  const context: Record<string, unknown> = {}
  new Function('globalThis', serverContentSource(root))(context)
  expect(context.__CER_CONTENT_STORE__).toEqual([JSON.parse(json)])
  expect(Object.getPrototypeOf((context.__CER_CONTENT_STORE__ as object[])[0])).toBe(Object.prototype)
})
it('rejects malformed or escaping manifests rather than producing an incomplete snapshot', () => {
  const root = fixture()
  writeFileSync(join(root, '_content/manifest.json'), 'broken')
  expect(() => serverContentSource(root)).toThrow()
  writeFileSync(join(root, '_content/manifest.json'), '[{"_path":"/../../../private"}]')
  expect(() => serverContentSource(root)).toThrow('Content path escapes')
})
it('initializes an empty snapshot for an app without a content output directory', () => {
  const root = fixture()
  const context: Record<string, unknown> = {}
  new Function('globalThis', serverContentSource(root))(context)
  expect(context.__CER_CONTENT_STORE__).toEqual([])
})
