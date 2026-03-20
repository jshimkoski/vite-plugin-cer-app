import { describe, it, expect } from 'vitest'
import { defineConfig } from '../../types/config.js'

describe('defineConfig', () => {
  it('returns the config object unchanged', () => {
    const config = { mode: 'spa' as const, port: 4000 }
    expect(defineConfig(config)).toBe(config)
  })

  it('accepts an empty config object', () => {
    expect(defineConfig({})).toEqual({})
  })

  it('preserves nested ssr config', () => {
    const config = { ssr: { dsd: false } }
    expect(defineConfig(config)).toEqual(config)
  })

  it('preserves nested ssg config', () => {
    const config = { ssg: { routes: ['/a', '/b'], concurrency: 2 } }
    expect(defineConfig(config)).toEqual(config)
  })
})
