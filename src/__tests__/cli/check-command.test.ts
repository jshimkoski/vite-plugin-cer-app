import { describe, expect, it } from 'vitest'
import { checkCommand } from '../../cli/commands/check.js'
import { findChromiumExecutable, median } from '../../cli/checks/lighthouse.js'

describe('checkCommand', () => {
  it('exposes link, performance, and Lighthouse production gates', () => {
    expect(checkCommand().commands.map((command) => command.name())).toEqual([
      'links',
      'performance',
      'lighthouse',
    ])
  })

  it('uses a stable median for repeated Lighthouse runs', () => {
    expect(median([1, 0.98, 1])).toBe(1)
    expect(median([0.9, 1, 0.8, 0.95])).toBe(0.95)
  })

  it('honors CHROME_PATH and detects Chromium-compatible browsers on macOS', () => {
    expect(findChromiumExecutable({
      environment: { CHROME_PATH: '/custom/chromium' },
      platform: 'darwin',
      exists: () => false,
    })).toBe('/custom/chromium')

    expect(findChromiumExecutable({
      environment: {},
      platform: 'darwin',
      exists: (path) => path.includes('Brave Browser.app'),
    })).toBe('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser')
  })
})
