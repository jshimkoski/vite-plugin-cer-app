import type { IncomingMessage } from 'node:http'

export interface LocaleComposable {
  /** The active locale code for the current request / page. */
  readonly locale: string
  /** All configured locale codes. */
  readonly locales: string[]
  /** The default locale code. */
  readonly defaultLocale: string
  /**
   * Returns the localised version of `path` for `targetLocale`.
   *
   * @example
   * switchLocalePath('fr', '/about') // → '/fr/about'
   * switchLocalePath('en', '/fr/about') // → '/about'  (when en is default + prefix_except_default)
   */
  switchLocalePath(targetLocale: string, path?: string): string
}

interface I18nVirtualConfig {
  locales: string[]
  defaultLocale: string
  strategy: 'prefix' | 'prefix_except_default' | 'no_prefix'
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _extractLocaleFromPath(pathname: string, locales: string[]): string | null {
  const first = pathname.split('/')[1]
  return locales.includes(first) ? first : null
}

function _stripLocalePrefix(pathname: string, locale: string): string {
  const prefix = `/${locale}`
  if (pathname === prefix) return '/'
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length)
  return pathname
}

function _buildLocalePath(
  pathname: string,
  targetLocale: string,
  currentLocale: string,
  config: I18nVirtualConfig,
): string {
  // Strip the current locale prefix (if any) to get the bare path
  const bare = _stripLocalePrefix(pathname, currentLocale)
  if (config.strategy === 'no_prefix') return bare
  if (config.strategy === 'prefix_except_default' && targetLocale === config.defaultLocale) return bare
  return `/${targetLocale}${bare === '/' ? '' : bare}`
}

// ─── Composable ───────────────────────────────────────────────────────────────

/**
 * Internationalisation composable. Returns the active locale and helpers for
 * building locale-aware URLs. Requires `i18n` to be configured in `cer.config.ts`.
 *
 * Works isomorphically: on the server it reads the URL path via AsyncLocalStorage;
 * on the client it reads `window.location.pathname`.
 *
 * When `i18n` is not configured, `locale` equals `'default'` and `locales` is `['default']`.
 *
 * @example
 * ```ts
 * const { locale, switchLocalePath } = useLocale()
 * console.log(locale)                           // 'fr'
 * console.log(switchLocalePath('en', '/fr/about')) // '/about'
 * ```
 */
export function useLocale(): LocaleComposable {
  // Read i18n config from the virtual module at runtime.
  // The virtual module is replaced by the bundler at build time.
  const g = globalThis as Record<string, unknown>
  const i18nConfig = g['__CER_I18N_CONFIG__'] as I18nVirtualConfig | null | undefined

  const locales = i18nConfig?.locales ?? ['default']
  const defaultLocale = i18nConfig?.defaultLocale ?? 'default'
  const strategy = i18nConfig?.strategy ?? 'no_prefix'

  // Resolve the current pathname from the server request context or window.
  let pathname = '/'
  const reqStore = g['__CER_REQ_STORE__'] as
    | { getStore(): { req: IncomingMessage } | null }
    | undefined
  if (reqStore) {
    const ctx = reqStore.getStore()
    if (ctx?.req.url) {
      try { pathname = new URL(ctx.req.url, 'http://x').pathname } catch { /* ignore */ }
    }
  } else if (typeof window !== 'undefined') {
    pathname = window.location.pathname
  }

  const detectedLocale = strategy !== 'no_prefix'
    ? (_extractLocaleFromPath(pathname, locales) ?? defaultLocale)
    : defaultLocale

  return {
    get locale() { return detectedLocale },
    get locales() { return locales },
    get defaultLocale() { return defaultLocale },
    switchLocalePath(targetLocale: string, path?: string): string {
      const base = path ?? pathname
      return _buildLocalePath(base, targetLocale, detectedLocale, { locales, defaultLocale, strategy })
    },
  }
}
