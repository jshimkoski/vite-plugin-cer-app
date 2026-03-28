/** Resolved public runtime config values. Available on both server and client. */
export interface RuntimeConfigPublic {
  [key: string]: unknown
}

/** Resolved private runtime config values. Available on the server only — never present on the client. */
export interface RuntimeConfigPrivate {
  [key: string]: string | string[]
}

/** Return value of `useRuntimeConfig()`. */
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
  const config: RuntimeConfigResult = mod ? (mod as RuntimeConfigResult) : { public: {} }

  // In browser contexts, wrap the result in a Proxy that throws a clear,
  // actionable error if any code attempts to read `runtimeConfig.private`.
  // Private values are server-only secrets and are never serialized into the
  // client bundle — accessing them client-side is always a bug.
  if (typeof window !== 'undefined') {
    return new Proxy(config, {
      get(target, prop) {
        if (prop === 'private') {
          throw new Error(
            '[cer-app] runtimeConfig.private is not available in the browser. ' +
            'Move this access into a server-only loader, middleware, or API handler.',
          )
        }
        return Reflect.get(target, prop)
      },
    })
  }

  return config
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
 * Array values (e.g. `sessionSecret: [newSecret, oldSecret]`) are passed
 * through unchanged — they are already resolved by the caller at config time.
 *
 * Accepts an optional `env` parameter so the function is unit-testable
 * without mutating `process.env`.
 */
export function resolvePrivateConfig(
  defaults: Record<string, string | string[]>,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Record<string, string | string[]> {
  return Object.fromEntries(
    Object.entries(defaults).map(([key, defaultValue]) => {
      // Array values are already fully resolved at config build time — pass through.
      if (Array.isArray(defaultValue)) {
        return [key, defaultValue.filter(Boolean)]
      }
      const envKey = toUpperSnakeCase(key)
      const resolved = env[key] ?? env[envKey] ?? defaultValue
      // Warn when no env var was found and the declared default is an empty string.
      // An empty-string default is the conventional way to declare a required secret
      // (the key exists for typing purposes but has no safe default value).
      if (resolved === '' && env[key] === undefined && env[envKey] === undefined) {
        console.warn(
          `[cer-app] runtimeConfig.private: "${key}" is an empty string — ` +
          `set ${envKey} in the environment to provide a value.`,
        )
      }
      return [key, resolved]
    }),
  )
}
