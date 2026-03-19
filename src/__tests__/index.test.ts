import { describe, it, expect } from 'vitest'

// Import from the main package entry to trigger coverage of src/index.ts
// re-exports. These are all re-exports of other modules so we just verify
// the named exports resolve without errors.
import { defineConfig, cerApp } from '../index.js'

describe('package main entry', () => {
  it('exports defineConfig', () => {
    expect(typeof defineConfig).toBe('function')
  })

  it('defineConfig is a pass-through', () => {
    const cfg = { mode: 'spa' as const }
    expect(defineConfig(cfg)).toBe(cfg)
  })

  it('exports cerApp', () => {
    expect(typeof cerApp).toBe('function')
  })
})
