import { describe, expect, it } from 'vitest'
import { pruneRuntimeExtendedColorVariables } from '../../../plugin/transforms/prune-runtime-css.js'

const runtimeVariablesId =
  '/project/node_modules/@jasonshimmy/custom-elements-runtime/dist/variables.css'

describe('pruneRuntimeExtendedColorVariables', () => {
  const css = `:root {
    --cer-outline-style: solid;
    --cer-color-neutral-500: #71717b;
    --cer-color-primary-500: #3b82f6;
    --cer-color-mauve-500: oklch(54.2% 0.034 322.5);
    --cer-color-slate-500: #64748b;
    --cer-color-blue-500: #3b82f6;
    --cer-color-rose-950: #4c0519;
  }
  .keep { color: var(--cer-color-blue-500, blue); }`

  it('removes opt-in palette declarations from the default app stylesheet', () => {
    const result = pruneRuntimeExtendedColorVariables(
      css,
      runtimeVariablesId,
      false,
    )

    expect(result).not.toContain('--cer-color-slate-500:')
    expect(result).not.toContain('--cer-color-mauve-500:')
    expect(result).not.toContain('--cer-color-blue-500:')
    expect(result).not.toContain('--cer-color-rose-950:')
    expect(result).toContain('--cer-color-primary-500:')
    expect(result).toContain('var(--cer-color-blue-500, blue)')
  })

  it('optimizes the bundled runtime stylesheet export', () => {
    const result = pruneRuntimeExtendedColorVariables(
      css,
      runtimeVariablesId.replace('variables.css', 'style.css'),
      false,
    )

    expect(result).not.toContain('--cer-color-blue-500:')
    expect(result).toContain('--cer-color-primary-500:')
  })

  it('optimizes a runtime linked from a local filesystem checkout', () => {
    const result = pruneRuntimeExtendedColorVariables(
      css,
      '/workspace/custom-elements/dist/variables.css',
      false,
    )

    expect(result).not.toContain('--cer-color-blue-500:')
    expect(result).toContain('--cer-color-primary-500:')
  })

  it('does not consume a following rule when the final declaration is minified', () => {
    const minified =
      ':root{--cer-color-primary-500:#3b82f6;--cer-color-rose-950:#4c0519}@property --cer-rotate{syntax:"<angle>";inherits:false;initial-value:0deg}'
    const result = pruneRuntimeExtendedColorVariables(
      minified,
      runtimeVariablesId.replace('variables.css', 'style.css'),
      false,
    )

    expect(result).toBe(
      ':root{--cer-color-primary-500:#3b82f6;}@property --cer-rotate{syntax:"<angle>";inherits:false;initial-value:0deg}',
    )
  })

  it('preserves the full palette when extended colors are enabled', () => {
    expect(
      pruneRuntimeExtendedColorVariables(css, runtimeVariablesId, true),
    ).toBe(css)
  })

  it('preserves only explicitly enabled extended color families', () => {
    const result = pruneRuntimeExtendedColorVariables(
      css,
      runtimeVariablesId,
      ['blue'],
    )

    expect(result).toContain('--cer-color-blue-500:')
    expect(result).not.toContain('--cer-color-slate-500:')
    expect(result).not.toContain('--cer-color-rose-950:')
  })

  it('does not rewrite unrelated stylesheets', () => {
    expect(
      pruneRuntimeExtendedColorVariables(css, '/project/app.css', false),
    ).toBe(css)
    expect(
      pruneRuntimeExtendedColorVariables(
        '--cer-color-primary-500:red;--cer-color-blue-500:blue;',
        '/project/theme/variables.css',
        false,
      ),
    ).toBe('--cer-color-primary-500:red;--cer-color-blue-500:blue;')
  })
})
