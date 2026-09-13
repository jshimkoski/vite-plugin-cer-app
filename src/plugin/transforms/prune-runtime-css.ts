const EXTENDED_COLOR_FAMILIES = [
  'mauve',
  'olive',
  'mist',
  'taupe',
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
  const isRuntimeStylesheet = /\/(?:style|variables)\.css(?:\?|$)/.test(id)
  const isRuntimePackagePath = id.includes('@jasonshimmy/custom-elements-runtime')
  // Vite resolves symlinked file: dependencies to their real filesystem path,
  // so a local runtime checkout no longer contains the npm package name.
  // Match that case by the runtime's stable core-token signature.
  const hasRuntimeTokenSignature =
    code.includes('--cer-color-primary-500:') &&
    code.includes('--cer-color-neutral-500:') &&
    code.includes('--cer-outline-style:')

  if (
    extendedColors === true ||
    !isRuntimeStylesheet ||
    (!isRuntimePackagePath && !hasRuntimeTokenSignature)
  ) {
    return code
  }

  const enabled = new Set(Array.isArray(extendedColors) ? extendedColors : [])
  return code.replace(
    EXTENDED_COLOR_DECLARATION,
    (declaration, family: string) => enabled.has(family) ? declaration : '',
  )
}
