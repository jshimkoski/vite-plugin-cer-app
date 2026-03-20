import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'pathe'

const src = readFileSync(
  resolve(import.meta.dirname, '../../runtime/entry-server-template.ts'),
  'utf-8',
)

describe('entry-server-template (ENTRY_SERVER_TEMPLATE content)', () => {
  it('template imports plugins from virtual:cer-plugins', () => {
    expect(src).toContain('virtual:cer-plugins')
  })

  it('template initializes plugins and sets globalThis.__cerPluginProvides', () => {
    expect(src).toContain('__cerPluginProvides')
    expect(src).toContain('_pluginProvides')
    expect(src).toContain('_pluginsReady')
  })

  it('template awaits _pluginsReady before handling each request', () => {
    expect(src).toContain('await _pluginsReady')
  })
})
