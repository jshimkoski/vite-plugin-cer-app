import { describe, expect, it } from 'vitest'
import {
  ENTRY_SERVER_TEMPLATE,
  serializeForInlineScript,
} from '../../runtime/entry-server-template.js'

describe('SSR inline-data serialization', () => {
  it('prevents a loader payload from breaking out of its script element', () => {
    const serialized = serializeForInlineScript({
      value: '</script><script>globalThis.pwned = true</script>\u2028&',
    })

    expect(serialized).not.toContain('</script>')
    expect(serialized).not.toContain('<script>')
    expect(serialized).not.toContain('\u2028')
    expect(serialized).toContain('\\u003c/script\\u003e')
    expect(JSON.parse(serialized)).toEqual({
      value: '</script><script>globalThis.pwned = true</script>\u2028&',
    })
  })

  it('uses the safe serializer for every hydration payload', () => {
    expect(ENTRY_SERVER_TEMPLATE).toContain('_serializeForInlineScript(data)')
    expect(ENTRY_SERVER_TEMPLATE).toContain('_serializeForInlineScript(_fetchObj)')
    expect(ENTRY_SERVER_TEMPLATE).toContain('_serializeForInlineScript(_authUser)')
    expect(ENTRY_SERVER_TEMPLATE).toContain('_serializeForInlineScript(_stateObj)')
  })

  it('only emits the hydration attribute for non-hydrating routes', () => {
    expect(ENTRY_SERVER_TEMPLATE).toContain(
      "...(hydrationStrategy === 'none' ? { 'data-cer-hydrate': 'none' } : {}),",
    )
    expect(ENTRY_SERVER_TEMPLATE).not.toContain(
      "'data-cer-hydrate': route?.meta?.hydrate === 'none' ? 'none' : undefined",
    )
  })

  it('does not serialize loader hydration data for a fully static route', () => {
    expect(ENTRY_SERVER_TEMPLATE).toContain("if (hydrationStrategy !== 'none')")
    const serializerIndex = ENTRY_SERVER_TEMPLATE.indexOf('_serializeForInlineScript(data)')
    const staticGuardIndex = ENTRY_SERVER_TEMPLATE.lastIndexOf(
      "if (hydrationStrategy !== 'none')",
      serializerIndex,
    )
    expect(staticGuardIndex).toBeGreaterThanOrEqual(0)
  })
})
