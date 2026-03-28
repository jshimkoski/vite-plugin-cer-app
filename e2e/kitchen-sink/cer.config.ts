import { appendFileSync } from 'node:fs'
import type { RequestHookContext, ResponseHookContext, ErrorHookContext } from '@jasonshimmy/vite-plugin-cer-app/types'

const LOG_FILE = '/tmp/cer-hooks-test.log'

// Kitchen sink configuration — mode is overridden by --mode CLI flag
export default {
  ssg: { routes: 'auto', concurrency: 2 },
  autoImports: { runtime: true, components: true, composables: true },
  runtimeConfig: {
    public: {
      appName: 'Kitchen Sink',
    },
    private: {
      // Resolved from SESSION_SECRET env var at server startup.
      // A hardcoded fallback is used here so e2e tests work without env setup.
      sessionSecret: 'kitchen-sink-e2e-test-secret-at-least-32-chars!',
    },
  },
  // i18n: prefix_except_default keeps default-locale (en) URLs unchanged so all
  // existing e2e tests continue to pass.  Only /fr-prefixed variants are new.
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
  },
  onRequest(ctx: RequestHookContext) {
    try { appendFileSync(LOG_FILE, `REQUEST ${ctx.method} ${ctx.path}\n`) } catch { /* ignore */ }
  },
  onResponse(ctx: ResponseHookContext) {
    try { appendFileSync(LOG_FILE, `RESPONSE ${ctx.statusCode} ${ctx.method} ${ctx.path} ${ctx.duration}ms\n`) } catch { /* ignore */ }
  },
  onError(_err: unknown, ctx: ErrorHookContext) {
    try { appendFileSync(LOG_FILE, `ERROR ${ctx.type} ${ctx.path}\n`) } catch { /* ignore */ }
  },
}
