export interface RuntimeConfigPublic {
  [key: string]: unknown
}

export interface RuntimeConfigPrivate {
  [key: string]: string
}

export interface RuntimeConfigResult {
  public: RuntimeConfigPublic
  private?: RuntimeConfigPrivate
}

/**
 * Returns the runtime configuration set in `cer.config.ts`.
 *
 * - `public` — available on both server and client.
 * - `private` — available on the server only (resolved from `process.env` at
 *   startup). Never present on the client.
 *
 * @example
 * // cer.config.ts
 * export default defineConfig({
 *   runtimeConfig: {
 *     public: { apiBase: process.env.VITE_API_BASE ?? '/api' },
 *     private: { dbUrl: '', secretKey: '' },
 *   },
 * })
 *
 * // app/pages/index.ts (loader — server-only)
 * const { private: priv } = useRuntimeConfig()
 * const rows = await db.query(priv.dbUrl)
 */
export function useRuntimeConfig(): RuntimeConfigResult {
  // Dynamic import resolved at runtime — avoids a static circular dependency
  // between the composable and the virtual module.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (globalThis as any).__cerRuntimeConfig
  if (mod) return mod as RuntimeConfigResult

  // Fallback: empty config (e.g. in test environments without the virtual module).
  return { public: {} }
}

/**
 * Called once during app bootstrap to store the resolved runtimeConfig on
 * globalThis so useRuntimeConfig() can access it synchronously in any context
 * (component render, composable, server handler).
 */
export function initRuntimeConfig(config: RuntimeConfigResult): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).__cerRuntimeConfig = config
}

/**
 * Converts a camelCase or mixed key to UPPER_SNAKE_CASE for env var lookup.
 * Examples: `dbUrl` → `DB_URL`, `secretKey` → `SECRET_KEY`, `API_KEY` → `API_KEY`.
 */
function toUpperSnakeCase(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toUpperCase()
}

/**
 * Resolves a private config object by looking up each key in the supplied
 * environment variable map, with the following precedence:
 *
 * 1. `env[key]`                   — exact case (e.g. `process.env.dbUrl`)
 * 2. `env[UPPER_SNAKE_CASE(key)]` — conventional env var form (e.g. `process.env.DB_URL`)
 * 3. `defaultValue`               — the declared default from `cer.config.ts`
 *
 * Accepts an optional `env` parameter so the function is unit-testable
 * without mutating `process.env`.
 */
export function resolvePrivateConfig(
  defaults: Record<string, string>,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(defaults).map(([key, defaultValue]) => [
      key,
      env[key] ?? env[toUpperSnakeCase(key)] ?? defaultValue,
    ]),
  )
}
