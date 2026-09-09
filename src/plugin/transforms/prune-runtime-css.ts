const EXTENDED_COLOR_FAMILIES = [
  'slate',
  'gray',
  'zinc',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
] as const

const EXTENDED_COLOR_DECLARATION = new RegExp(
  String.raw`[\t ]*--cer-color-(${EXTENDED_COLOR_FAMILIES.join('|')})-[\w-]+\s*:[^;{}]*(?:;|(?=\s*}))[\t ]*`,
  'g',
)

/**
 * Removes the opt-in extended palette from the runtime's global variables
 * stylesheet when an app uses the default core palette. Utility declarations
 * retain their own color fallbacks, so this avoids shipping hundreds of unused
 * custom-property declarations without changing rendered colors.
 */
export function pruneRuntimeExtendedColorVariables(
  code: string,
  id: string,
  extendedColors: boolean | string[],
): string {
  if (
    extendedColors === true ||
    !id.includes('@jasonshimmy/custom-elements-runtime') ||
    !/\/(?:style|variables)\.css(?:\?|$)/.test(id)
  ) {
    return code
  }

  const enabled = new Set(Array.isArray(extendedColors) ? extendedColors : [])
  return code.replace(
    EXTENDED_COLOR_DECLARATION,
    (declaration, family: string) => enabled.has(family) ? declaration : '',
  )
}
