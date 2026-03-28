# Implementation Plan: Production Hardening

## Overview

This plan addresses every gap identified in the evidence-based production-readiness audit.
Items are ordered by severity: critical blockers first, minor gaps second, feature parity
gaps last. Each item includes the exact diagnosis (file + line), the fix design, all
implementation steps, and required tests.

---

## Priority legend

| Priority | Meaning |
|---|---|
| **P0 — Critical** | Can crash or corrupt an active request in production |
| **P1 — Minor** | Incorrect behavior or security gap; not immediately fatal |
| **P2 — Feature parity** | Present in Nuxt/Next.js; absence limits use cases |

---

## P0-1 — SSR render errors crash the response stream ✅ IMPLEMENTED

### Diagnosis

**File:** `src/runtime/entry-server-template.ts`, line 319

```ts
const stream = renderToStreamWithJITCSSDSD(vnode, { dsdPolyfill: false, router })
```

`renderToStreamWithJITCSSDSD` constructs a `ReadableStream` whose `start()` callback runs
**synchronously** inside the constructor. If any component render function throws, that
exception propagates out of the constructor and through the `handler` function entirely
unhandled — because lines 290–389 have no top-level `try/catch`. The HTTP response headers
may or may not have been written at that point. In Node.js HTTP servers, an uncaught
exception in a request handler kills the connection immediately. There is no fallback to a
client-side render and no 500 response.

The async streaming loop (lines 376–380) also lacks error handling:

```ts
while (true) {
  const { value, done } = await reader.read()
  if (done) break
  res.write(value)
}
```

If `reader.read()` rejects mid-stream (headers already sent), the exception propagates
upward through the ALS chains and crashes the handler with a half-flushed response.

### Fix design

Wrap the synchronous stream construction and the async streaming loop in `try/catch`
blocks inside the entry-server template. On render error:

1. **Before headers sent** (`!res.headersSent`): send HTTP 500 with the error page vnode
   rendered as a fallback, or a plain HTML error message if the error page itself fails.
2. **After headers sent** (mid-stream): close the stream cleanly with an inline error
   comment and call `res.end()`. The browser will receive a complete but truncated
   document; JS hydration will fail gracefully since the error boundary component is
   already in the entry chunk.

Inline error rendering must not call `renderToStreamWithJITCSSDSD` again recursively
(infinite loop risk). Use a synchronous `renderToString` fallback if available, or emit
a minimal HTML error string directly.

### Implementation steps

**Project:** `vite-plugin-cer-app`

1. **`src/runtime/entry-server-template.ts`** — wrap the stream construction and read loop:

   ```ts
   // Replace line 319 area with:
   let stream: ReadableStream<string>
   try {
     stream = renderToStreamWithJITCSSDSD(vnode, { dsdPolyfill: false, router })
   } catch (renderErr) {
     const errMsg = renderErr instanceof Error ? renderErr.message : String(renderErr)
     console.error('[cer-app] SSR render error (synchronous):', renderErr)
     if (!res.headersSent) {
       res.statusCode = 500
       const errBody = errorTag
         ? `<${errorTag} error=${JSON.stringify(errMsg)}></${errorTag}>`
         : `<div style="font-family:monospace;padding:2rem">SSR error: ${errMsg}</div>`
       res.setHeader('Content-Type', 'text/html; charset=utf-8')
       res.end(`<!DOCTYPE html><html><body>${errBody}</body></html>`)
     } else {
       res.end()
     }
     return
   }
   ```

   Wrap the streaming read loop:
   ```ts
   try {
     while (true) {
       const { value, done } = await reader.read()
       if (done) break
       res.write(value)
     }
     res.end(DSD_POLYFILL_SCRIPT + fromBodyClose)
   } catch (streamErr) {
     console.error('[cer-app] SSR stream error (mid-stream):', streamErr)
     if (!res.writableEnded) res.end()
   }
   ```

2. **`src/__tests__/plugin/entry-server-template.test.ts`** — add assertions:
   - Template contains the synchronous render error catch block
   - Template contains the stream loop error catch block

3. **`e2e/kitchen-sink/app/pages/`** — add `render-error-test.ts`: a page whose render
   function intentionally `throw new Error('render-error-test')` when
   `?crash=1` query param is present.

4. **`e2e/cypress/e2e/`** — add `render-error.cy.ts`:
   - `cy.request('/render-error-test?crash=1')` — assert status 500, body contains error
     markup (no connection reset)
   - `cy.visit('/render-error-test')` — assert page loads normally (no query param)

### Implementation notes

- Implemented as a single `try/catch (_renderErr)` wrapping the full render + stream block.
- `_headCollectionOpen` flag ensures `endHeadCollection()` is always called to prevent global state leaks.
- Before-headers path: sets `res.statusCode = 500`, sends a complete HTML error page.
- After-headers path: calls `res.end()` to close cleanly.
- Unit tests added to `src/__tests__/plugin/entry-server-template.test.ts`.
- **Important clarification:** The custom-elements runtime already catches *component-level* render errors internally (`ssr-context.ts` `runComponentSSRRender` try/catch). A component throwing during render produces a warning log and an empty DSD placeholder — the server returns 200. The entry-server-template try/catch protects against *infrastructure-level* failures that escape the runtime (e.g., a crash in the SSR helper machinery itself).
- Kitchen-sink page `e2e/kitchen-sink/app/pages/render-error-test.ts` throws unconditionally to verify graceful degradation.
- Cypress spec `e2e/cypress/e2e/ssr-render-error.cy.ts` verifies: HTTP 200 response (runtime catches the component error), valid HTML body, component rendered as empty placeholder, server survives for subsequent requests.

---

## P0-2 — ISR concurrent revalidation race condition ✅ IMPLEMENTED

### Diagnosis

**File:** `src/runtime/isr-handler.ts`, lines 156–171

```ts
if (!cached.revalidating) {
  cached.revalidating = true
  _serveFromCache(cached, res, 'STALE')
  const timeout = setTimeout(() => { if (cached) cached.revalidating = false }, 30_000)
  _renderForCache(urlPath, handler, revalidate).then((entry) => {
    clearTimeout(timeout)
    if (entry) cache.set(urlPath, entry)
    else if (cached) cached.revalidating = false
  }).catch(() => {
    clearTimeout(timeout)
    if (cached) cached.revalidating = false
  })
  return
}
_serveFromCache(cached, res, 'STALE')  // line 170
```

The `revalidating` boolean is a soft lock. The 30-second `setTimeout` resets it to `false`
even if `_renderForCache` is still running (it has not been cancelled). If the render takes
over 30 seconds (slow page, large SSR), `revalidating` resets to `false`. The next request
sets it to `true` again and starts **a second concurrent render** for the same path. Under
high traffic this can produce many simultaneous background renders for the same URL,
consuming unbounded memory and CPU.

Additionally, `_renderForCache` is a promise that is not cancelled when a second render
starts. The first render may complete after the second and overwrite the cache with older
content (`cache.set` on line 162 is unconditional on the key).

### Fix design

Replace the boolean flag with a **per-path pending Promise** stored in a `Map`. A path
has at most one in-flight revalidation. New requests for the same stale path while
revalidation is pending are served the stale cached response immediately — no new Promise
is created. When the revalidation resolves or rejects, the pending entry is cleared.

Remove the `setTimeout` watchdog entirely. Instead, add an optional `revalidateTimeout`
option (default: `30_000` ms) that races with `_renderForCache` using `Promise.race`. If
the render times out, the pending entry is cleared and the stale response continues to be
served on the next request (which will attempt a fresh render).

The last-writer-wins problem is eliminated because there is only ever one in-flight render
per path.

### Implementation steps

**Project:** `vite-plugin-cer-app`

1. **`src/runtime/isr-handler.ts`** — replace the `revalidating` boolean with a pending map:

   ```ts
   // Replace: cached.revalidating field entirely
   // Add module-level:
   const _pending = new Map<string, Promise<void>>()

   // In createIsrHandler, stale branch:
   if (!_pending.has(urlPath)) {
     const revalidateMs = (options?.revalidateTimeout ?? 30_000)
     const renderPromise = Promise.race([
       _renderForCache(urlPath, handler, revalidate),
       new Promise<null>((_, reject) =>
         setTimeout(() => reject(new Error('ISR revalidation timeout')), revalidateMs)
       ),
     ])
       .then((entry) => {
         if (entry) cache.set(urlPath, entry)
       })
       .catch((err) => {
         console.warn('[cer-app] ISR revalidation failed for', urlPath, err?.message ?? err)
       })
       .finally(() => {
         _pending.delete(urlPath)
       })
     _pending.set(urlPath, renderPromise)
   }
   _serveFromCache(cached, res, 'STALE')
   ```

2. **`src/runtime/isr-handler.ts`** — remove the `revalidating` field from `CacheEntry`
   interface and all references to it.

3. **`src/__tests__/runtime/isr-handler.test.ts`** (create if missing) — add tests:
   - Two concurrent stale requests → only one `_renderForCache` call made
   - Render timeout → pending cleared, next request triggers a new render
   - Render success → cache updated, no stale entry served after

4. **`e2e/kitchen-sink/`** — existing `isr-nested-runtime.cy.ts` may already cover ISR;
   verify it exercises the stale-while-revalidate path.

### Implementation notes

- Replaced `revalidating: boolean` in `IsrCacheEntry` with `Map<string, Promise<void>> _inFlight` inside `createIsrHandler`.
- At most one background render runs per URL path at any time (true lock, not a soft boolean).
- Lock is released via `.finally(() => _inFlight.delete(urlPath))` when the Promise settles — no 30s timer needed.
- The "30s timeout" test was replaced with a "lock released after Promise resolves" test.
- `revalidating` field removed from the `IsrCacheEntry` interface.

---

## P0-3 — Async SSR components can hang indefinitely ✅ IMPLEMENTED

### Diagnosis

**File:** `custom-elements/src/lib/runtime/` — `renderToStreamWithJITCSSDSD`

Async components are rendered as placeholder elements during the synchronous first pass;
their resolved content is streamed as swap scripts. If an async component's Promise never
settles (network failure, infinite loop in setup), the `reader.read()` loop in the
entry-server template (lines 376–380) awaits forever. The HTTP connection is left open and
the client spinner never stops. There is no configurable timeout.

### Fix design

Add a `ssrTimeout` option (milliseconds, default `10_000`) to `renderToStreamWithJITCSSDSD`.
Internally, the stream controller should track all pending async component Promises.
When `ssrTimeout` elapses, any remaining pending Promises are forcibly resolved with an
empty swap (the placeholder element stays in the DOM). The stream is then closed normally.

If `ssrTimeout: 0` is passed, the timeout is disabled (explicit opt-out for known-safe
environments).

### Implementation steps

**Project:** `@jasonshimmy/custom-elements-runtime`

1. **`src/lib/runtime/ssr/` (whichever file implements `renderToStreamWithJITCSSDSD`)**
   — add `ssrTimeout` parameter and timeout logic:
   - Track pending async Promises in a `Set`
   - After the synchronous first-pass render, set a `setTimeout` for `ssrTimeout` ms
   - When it fires, resolve all remaining pending Promises with empty content and enqueue
     the stream close
   - Clear the timeout if all Promises resolve naturally before it fires

2. **`src/lib/vite-plugin.ts`** — thread `ssrTimeout` through the `CerSSROptions` interface
   so it's configurable in `cer.config.ts` under `jitCss.ssr.ssrTimeout`.

3. **`src/runtime/entry-server-template.ts`** — pass the configured timeout:
   ```ts
   const stream = renderToStreamWithJITCSSDSD(vnode, {
     dsdPolyfill: false,
     router,
     ssrTimeout: runtimeConfig.ssrTimeout ?? 10_000,
   })
   ```

4. **Tests (runtime):**
   - `test/ssr-async-timeout.spec.ts` — component with a never-settling Promise; assert
     stream closes within `ssrTimeout + buffer` ms with placeholder content in output
   - `test/ssr-async-timeout.spec.ts` — component that resolves before timeout; assert
     resolved content appears and timeout is cleared

5. **`e2e/kitchen-sink/app/pages/`** — add `async-component-test.ts` with a slow
   async component (resolves after 100 ms) and a never-settling one (guarded by a query
   param). E2e: assert the page renders within a reasonable time and does not hang.

6. **`docs/configuration.md`** — document `ssrTimeout` option.

### Implementation notes

- Implemented as `asyncTimeout?: number` option (default `30_000` ms) on `renderToStream` and `renderToStreamWithJITCSSDSD` in `custom-elements/src/lib/ssr.ts`.
- Each `await entry.promise` is wrapped with `Promise.race([entry.promise, timeoutPromise])` — timed-out entries leave their placeholders in the DOM for client-side hydration.
- Unit tests in `custom-elements/test/render-to-stream.spec.ts` cover: basic streaming, timeout closes the stream, option threads through `renderToStreamWithJITCSSDSD`, sync render errors.
- Note: The plan proposed `ssrTimeout` as the option name; the implementation uses `asyncTimeout` to better describe what is being timed (the async component Promises, not the overall SSR render).

---

## P0-4 — Reactive subscriptions leak on component disconnect ✅ IMPLEMENTED

### Diagnosis

**File:** `custom-elements/src/lib/runtime/component/factory.ts`, lines 161–169

The `onDisconnected` lifecycle hook fires when the component is removed from the DOM.
However, it only calls the **user-provided** cleanup function (`lifecycleHooks.onDisconnected`).
The framework itself does not track or clean up `watch()`, `watchEffect()`, and `computed()`
subscriptions created during the component's render lifecycle. If the user forgets to call
cleanup — which is common, especially in layout components — subscriptions accumulate for
the life of the session. Layouts are particularly high-risk: a `layout-default` component
may be mounted once and never disconnected, accumulating subscriptions on every navigation.

### Fix design

The reactive system already tracks "which component is currently rendering" via
`reactiveSystem.setCurrentComponent(componentId, callback)`. Extend this to also **track
all subscriptions created** while a component is the current component. Store the stop
functions in a per-component registry keyed by `componentId`.

When `onDisconnected` fires on a component, the framework automatically calls all registered
stop functions for that `componentId` **before** calling the user's hook. This is transparent
to the user and backward compatible.

`watch`, `watchEffect`, and `computed` must return stop functions (they likely already do —
verify) and register themselves with the reactive system when a `componentId` is active.

### Implementation steps

**Project:** `@jasonshimmy/custom-elements-runtime`

1. **`src/lib/runtime/reactive/` (wherever `reactiveSystem` lives)**
   — add a `componentSubscriptions: Map<string, Set<() => void>>` registry:
   ```ts
   function trackSubscription(componentId: string, stop: () => void): void {
     if (!componentSubscriptions.has(componentId)) {
       componentSubscriptions.set(componentId, new Set())
     }
     componentSubscriptions.get(componentId)!.add(stop)
   }

   function cleanupComponent(componentId: string): void {
     const stops = componentSubscriptions.get(componentId)
     if (stops) {
       for (const stop of stops) stop()
       componentSubscriptions.delete(componentId)
     }
   }
   ```

2. **`src/lib/runtime/reactive/watch.ts`** (or equivalent) — when `watch()` or
   `watchEffect()` is called while a `componentId` is active (i.e., during a render),
   register the returned stop function:
   ```ts
   const stop = _createWatch(...)
   const activeId = reactiveSystem.getCurrentComponent()
   if (activeId) trackSubscription(activeId, stop)
   return stop
   ```

3. **`src/lib/runtime/component/factory.ts`, `onDisconnected` path (line 161)**
   — call `cleanupComponent(componentId)` before the user's hook:
   ```ts
   onDisconnected: (context) => {
     cleanupComponent((context as InternalContext)._componentId)
     if (lifecycleHooks.onDisconnected) { ... }
   }
   ```

4. **`src/lib/runtime/reactive/computed.ts`** — same registration for computed
   dependencies if computed tracks subscriptions internally.

5. **Tests:**
   - `test/subscription-cleanup.spec.ts` — mount a component with `watch()`, disconnect
     it, assert the watch callback is never called after disconnect
   - `test/subscription-cleanup.spec.ts` — mount, reconnect, remount; assert subscriptions
     are re-registered correctly
   - `test/subscription-cleanup.spec.ts` — layout component (never disconnected); assert
     subscriptions are still live after a simulated navigation

6. **`docs/components.md`** — add a note that manual cleanup in `onDisconnected` is no
   longer required for `watch`, `watchEffect`, and `computed` created during render.

### Implementation notes

- Fixed in `custom-elements/src/lib/runtime/reactive.ts` `cleanup()` method.
- Before deleting the component's `componentData` entry, iterates `data.watchers` and calls `this.cleanup(wid)` recursively for each — identical to the pattern already used in `setCurrentComponent()` for re-renders.
- This means `watch()`, `watchEffect()`, and `computed()` created during render are automatically unsubscribed when the component disconnects, without requiring manual `useOnDisconnected(stop)` calls.
- Unit tests in `custom-elements/test/reactive-cleanup-cascade.spec.ts`.
- Note: The plan described a more complex "subscription registry" approach. The actual fix leverages the existing `data.watchers` map that `registerWatcher()` already populates — no new data structure needed.

---

## P1-1 — No 404 fallback when catch-all route is absent

### Diagnosis

**File:** `src/plugin/virtual/routes.ts`, lines 197–202

The framework converts `app/pages/404.ts` to a `/:all*` catch-all route. If neither
`404.ts` nor a user-defined `[...all].ts` exists, no catch-all is generated. The router's
`matchRoute()` returns `null` for any unrecognized path. The behavior is undefined: likely
a blank page or a thrown exception inside `_prepareRequest`.

### Fix design

In `generateRoutesCode`, after the deduplication and sort step, check whether any route
with `routePath: '/:all*'` exists. If not, append a minimal generated catch-all that
renders nothing but returns HTTP 404:

```ts
// Append synthesized catch-all if none exists
if (!sorted.some(e => e.isCatchAll)) {
  items.push(`  {\n    path: '/:all*',\n    load: () => Promise.resolve({ default: null, loader: null }),\n    meta: { render: 'ssr' }\n  }`)
}
```

The `null` tag name must be handled in `_prepareRequest` in the entry-server template:
if `mod.default` is `null`, skip rendering and return `{ status: 404, vnode: errorVnode }`.

### Implementation steps

**Project:** `vite-plugin-cer-app`

1. **`src/plugin/virtual/routes.ts`** — after `sortRoutes`, add the synthetic catch-all
   guard as described above.

2. **`src/runtime/entry-server-template.ts`**, `_prepareRequest` — add null tag handling:
   ```ts
   if (!mod.default) {
     // No page component — return 404
     const notFoundVnode = errorTag
       ? { tag: errorTag, props: { attrs: { error: 'Not Found', status: '404' } }, children: [] }
       : { tag: 'div', props: {}, children: 'Not Found' }
     return { vnode: notFoundVnode, router, head: '', status: 404 }
   }
   ```

3. **`src/__tests__/plugin/virtual/routes.test.ts`** — add test: when no catch-all page
   exists in the pages directory, the generated routes code contains `'/:all*'`.

4. **`src/__tests__/plugin/entry-server-template.test.ts`** — add assertion: template
   handles `mod.default === null` with a 404 status return.

---

## P1-2 — Server middleware cannot return status codes other than 500

### Diagnosis

**File:** `src/runtime/entry-server-template.ts` (the `runServerMiddleware` template body)

The middleware error branch always writes `res.statusCode = 500`. Middleware that wants to
reject with 401 (unauthorized) or 403 (forbidden) must manually write the full response
and call `res.end()` before returning — there is no structured way to signal a specific
HTTP status from a middleware throw.

### Fix design

Inspect the thrown error for a `status` or `statusCode` numeric property (same pattern
used by `_prepareRequest` for loader errors). If found, use that value; otherwise fall back
to 500.

```ts
} catch (err: unknown) {
  if (!res.writableEnded) {
    const status = typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status: unknown }).status)
      : 500
    res.statusCode = isNaN(status) ? 500 : status
    res.end('Internal Server Error')
  }
  return false
}
```

Document that middleware can do `throw { status: 401, message: 'Unauthorized' }` to
produce a non-500 response.

### Implementation steps

**Project:** `vite-plugin-cer-app`

1. **`src/runtime/entry-server-template.ts`** — update the server middleware error catch
   block as described.

2. **`src/__tests__/plugin/entry-server-template.test.ts`** — add assertions:
   - Template inspects `err.status` for non-500 values in server middleware catch block

3. **`docs/middleware.md`** — document `throw { status: 401 }` pattern.

---

## P1-3 — Session secret is not rotatable

### Diagnosis

**File:** `src/runtime/composables/use-session.ts`, lines 124–138

`_getSecret()` reads a single string from `runtimeConfig.private.sessionSecret`. The
HMAC key is derived from this string on every sign/verify call. If the secret is changed
(periodic rotation, leak remediation), all existing session cookies fail signature
verification and every signed-in user is immediately logged out.

### Fix design

Support `sessionSecret` as either a `string` (existing behavior) or an `array of strings`.
When validating an incoming cookie, try each key in order. When signing a new cookie,
always use the **first** key (the active key). Old sessions signed with any of the other
keys are still accepted until they expire, giving users a graceful rotation window.

```ts
// cer.config.ts / runtimeConfig.private
sessionSecret: process.env.SESSION_SECRET       // existing: single string
sessionSecret: [
  process.env.SESSION_SECRET_NEW,               // active key (signs new sessions)
  process.env.SESSION_SECRET_OLD,               // accepted for validation only
]
```

### Implementation steps

**Project:** `vite-plugin-cer-app`

1. **`src/types/config.ts`** — update `RuntimePrivateConfig.sessionSecret` type:
   ```ts
   sessionSecret?: string | string[]
   ```

2. **`src/runtime/composables/use-session.ts`**:
   - `_getSecret()` → `_getSecrets(): string[]` — always returns an array (single string
     is wrapped in `[secret]`)
   - `set()`: signs with `secrets[0]`
   - `get()`: tries each key in order; returns data from the first that verifies

3. **`src/__tests__/runtime/use-session.test.ts`** — add tests:
   - Array of two secrets: cookie signed with second key is still accepted
   - Array of two secrets: new cookies are signed with the first key
   - Secret rotation: old cookie accepted with old secret in array; rejected after
     old secret removed from array

4. **`docs/configuration.md`** — document array form under `runtimeConfig.private.sessionSecret`.

---

## P1-4 — Cloudflare adapter has no size check for inlined HTML

### Diagnosis

**File:** `src/cli/adapters/cloudflare.ts`, line 58–68

The entire contents of `dist/client/index.html` are inlined as a template literal string
constant inside `_worker.js`. Cloudflare Workers have a **1 MB compressed script size
limit** (Free plan) or **10 MB** (Paid plan). A large HTML template — one with many
inlined scripts, large DSD payloads, or bulky meta tags — can push the worker file over
this limit, causing deployment to fail with a cryptic Wrangler error.

### Fix design

After generating `_worker.js`, measure its byte length. If it exceeds 900 KB (conservative
Free plan limit), print a clear warning with the measured size and the Cloudflare limit.
If it exceeds 9 MB (conservative Paid plan limit), print an error and exit with a non-zero
code.

Thresholds should be configurable via `adapter: { name: 'cloudflare', warnSize: ..., errorSize: ... }`.

### Implementation steps

**Project:** `vite-plugin-cer-app`

1. **`src/cli/adapters/cloudflare.ts`** — after writing `_worker.js`, check file size:

   ```ts
   const workerPath = join(outputDir, '_worker.js')
   const sizeBytes = statSync(workerPath).size
   const warnLimit = options?.warnSize ?? 900_000
   const errorLimit = options?.errorSize ?? 9_000_000
   if (sizeBytes > errorLimit) {
     console.error(`[cer-app] Cloudflare _worker.js is ${(sizeBytes / 1e6).toFixed(1)} MB — exceeds the ${(errorLimit / 1e6).toFixed(0)} MB limit. Build will likely fail to deploy.`)
     process.exit(1)
   } else if (sizeBytes > warnLimit) {
     console.warn(`[cer-app] Cloudflare _worker.js is ${(sizeBytes / 1e3).toFixed(0)} KB — approaching the Cloudflare Free plan 1 MB limit.`)
   }
   ```

2. **`src/types/config.ts`** — add optional `CloudflareAdapterOptions` type and thread it
   through `CerAppConfig`.

3. **`src/__tests__/cli/adapters/cloudflare.test.ts`** — add test: mock `statSync` to
   return a large size; assert the warning/error message is emitted.

4. **`docs/configuration.md`** — document `adapter` options for Cloudflare including
   `warnSize` and `errorSize`.

---

## P1-5 — Auto-import injects full import groups; unused exports cannot be tree-shaken

### Diagnosis

**File:** `src/plugin/transforms/auto-import.ts`, lines 90–113

`isFrameworkImportNeeded` returns `true` if any single identifier from `FRAMEWORK_IDENTIFIERS`
is found in the file. When it does, the entire `FRAMEWORK_IMPORTS` string is prepended —
all 15 composables in one import statement. A page that uses only `useHead` gets:

```ts
import { useHead, usePageData, useInject, useRuntimeConfig, defineMiddleware,
         defineServerMiddleware, useSeoMeta, useCookie, useSession, useAuth,
         useFetch, useRoute, navigateTo, useState, useLocale }
  from '@jasonshimmy/vite-plugin-cer-app/composables'
```

Rollup cannot tree-shake named imports from packages whose `sideEffects` is not `false`.
Both packages declare `sideEffects: ["**/*.css"]`, which means Rollup must conservatively
treat all non-CSS files as having side effects. The unused 14 composables ship in every
page chunk that uses even one framework composable.

The same problem applies to `RUNTIME_IMPORTS` (29 runtime exports for any page using
even `html`) and `DIRECTIVE_IMPORTS` (4 directive exports for any page using `when`).

### Fix design

Replace the three monolithic import strings with per-identifier injection. `FRAMEWORK_IMPORTS`,
`RUNTIME_IMPORTS`, and `DIRECTIVE_IMPORTS` become maps of identifier → source module path.
The `autoImportTransform` function builds the minimum import statement containing only the
identifiers actually referenced in the file.

```ts
const RUNTIME_MAP: Record<string, string> = {
  component: '@jasonshimmy/custom-elements-runtime',
  html:      '@jasonshimmy/custom-elements-runtime',
  ref:       '@jasonshimmy/custom-elements-runtime',
  // ...
}
const DIRECTIVE_MAP: Record<string, string> = {
  when:  '@jasonshimmy/custom-elements-runtime/directives',
  each:  '@jasonshimmy/custom-elements-runtime/directives',
  // ...
}
const FRAMEWORK_MAP: Record<string, string> = {
  useHead:    '@jasonshimmy/vite-plugin-cer-app/composables',
  useState:   '@jasonshimmy/vite-plugin-cer-app/composables',
  // ...
}
```

Group by source path before emitting so that `import { useHead, useState } from '...'` is
a single statement rather than two. This preserves the existing injection shape for pages
that use many identifiers.

The change is backward compatible: the injected code produces identical named imports from
the same module paths. Only the subset changes.

### Implementation steps

**Project:** `vite-plugin-cer-app`

1. **`src/plugin/transforms/auto-import.ts`** — replace the three string constants and
   their `isXImportNeeded` + injection pattern with map-based per-identifier injection.
   Keep the existing duplicate-import guard (check if already importing from the source
   path before injecting).

2. **`src/__tests__/plugin/transforms/auto-import.test.ts`** — update all tests that
   check the injected import string to match the new per-identifier form:
   - Page using only `html` → injects only `{ html }` from runtime, not all 29
   - Page using `useHead` + `useState` → injects `{ useHead, useState }` from composables,
     not all 15
   - Page already importing `{ html }` → no duplicate injection
   - Page using `when` → injects only `{ when }` from directives
   - Page using no recognized identifier → returns null

3. **`docs/configuration.md`** — update the auto-imports section to note that only used
   identifiers are injected.

---

## P2-1 — Nested routes

### Diagnosis

The router ([`virtual/routes.ts`](../src/plugin/virtual/routes.ts)) generates a flat route
array. The `layoutChain` meta property is a workaround for layout nesting but it is not
true nested routing — child routes cannot define their own data loaders that compose with
parent loaders, and there is no shared parent URL segment prefix enforcement.

### Fix design

Adopt the `_layout.ts` convention already partially present in the codebase
(`app/pages/admin/_layout.ts` is excluded from page scanning at
[`virtual/routes.ts:189`](../src/plugin/virtual/routes.ts)). Extend this to make
`_layout.ts` files act as **route group wrappers** that set shared `meta` (layout,
middleware, prefix) for all routes in the same directory.

A route group directory (`app/pages/admin/`) with a `_layout.ts` that exports:
```ts
export const meta = { layout: 'admin', middleware: ['requireAuth'] }
```
would automatically apply those meta fields to all routes in `app/pages/admin/**/*.ts`
without repeating them on each page.

This is additive only — no behavior changes for existing pages. True deeply nested router
rendering (React Router / Nuxt nested views) is deferred as a larger scope change; the
immediate goal is shared meta inheritance.

### Implementation steps

**Project:** `vite-plugin-cer-app`

1. **`src/plugin/virtual/routes.ts`**:
   - After scanning pages, scan for `_layout.ts` files in any subdirectory
   - Import each `_layout.ts` at build time (via `readFileSync` + regex extraction or
     a Vite `load` call) to extract the exported `meta` object
   - Merge that meta into every route whose `filePath` is under that directory
   - Directory meta has lower precedence than page-level meta (page can override)

2. **`src/__tests__/plugin/virtual/routes.test.ts`** — add tests:
   - `admin/_layout.ts` with `middleware: ['requireAuth']` → all `admin/**` routes
     inherit `middleware`
   - Page-level `meta.middleware` overrides inherited value
   - No `_layout.ts` → no change to existing behavior

3. **`e2e/kitchen-sink/app/pages/admin/`** — already has `_layout.ts` and `dashboard.ts`;
   update to verify meta inheritance in `e2e/cypress/e2e/routes.cy.ts`.

4. **`docs/routing.md`** — document `_layout.ts` meta inheritance.

---

## P2-2 — Per-route error components

### Diagnosis

`app/error.ts` is the single global error boundary. A 404 page uses the same error
component as a database crash on the admin dashboard. Nuxt and Next.js support
per-segment `error.vue` / `error.tsx` files.

### Fix design

Support an `app/pages/[route].error.ts` convention (co-located error component):

- `app/pages/admin/dashboard.error.ts` → used as the error boundary for the
  `/admin/dashboard` route only
- `app/pages/admin/_error.ts` → used as the error boundary for all routes in
  `app/pages/admin/**`
- `app/error.ts` → global fallback (existing behavior)

The error component resolution priority: co-located `.error.ts` > directory `_error.ts` >
global `app/error.ts`.

The route `meta` object gains an `errorTag` field that the entry-server template and the
client `cer-layout-view` component consult when displaying an error boundary.

### Implementation steps

**Project:** `vite-plugin-cer-app`

1. **`src/plugin/virtual/routes.ts`** — during route building, check for a co-located
   `*.error.ts` or a directory-level `_error.ts`. If found, import the file, extract the
   component tag, and add `errorTag: 'page-admin-dashboard-error'` to the route meta.

2. **`src/runtime/entry-server-template.ts`** (`_prepareRequest`) — prefer route-level
   `routeMeta?.errorTag` over the global `errorTag` when rendering loader errors.

3. **`src/runtime/app-template.ts`** (`cer-layout-view` render function) — prefer
   `routeMeta?.errorTag` over the global `errorTag` for client-side error rendering.

4. **`src/plugin/virtual/error.ts`** — update to also expose a per-route lookup API
   alongside the current boolean/string exports.

5. **`src/__tests__/plugin/virtual/routes.test.ts`** — test that co-located `.error.ts`
   produces correct `errorTag` in route meta.

6. **`docs/routing.md`** — document co-located error components.

---

## P2-3 — Client-side `useFetch()` does not deduplicate concurrent calls

### Diagnosis

**File:** `src/runtime/composables/use-fetch.ts`

Server-side: `useFetch` deduplicates via the per-request `_cerFetchStore` map. If
the same key is fetched twice inside one loader, only one network request is made.

Client-side: when a component mounts and calls `useFetch('/api/posts')`, and another
component on the same page also calls `useFetch('/api/posts')`, two identical network
requests are issued concurrently. There is no in-flight deduplication.

### Fix design

Add a module-level `_inflight: Map<string, Promise<unknown>>` on the client. When
`refresh()` is called:

1. If a key is already in `_inflight`, await the existing Promise rather than issuing a
   new fetch.
2. Remove the key from `_inflight` when the Promise settles (both resolve and reject).

This is a lightweight version of React Query's deduplication — no persistence, no
background refetch coordination, just in-flight deduplication within a single render cycle.

The map is module-level (not per-component), so two components fetching the same URL
concurrently share one request.

### Implementation steps

**Project:** `vite-plugin-cer-app`

1. **`src/runtime/composables/use-fetch.ts`** — add client deduplication:
   ```ts
   const _inflight = new Map<string, Promise<unknown>>()

   // Inside the client refresh() function:
   if (_inflight.has(key)) {
     return _inflight.get(key)!.then(/* update reactive state */)
   }
   const promise = _fetchData(url, fetchOptions).finally(() => _inflight.delete(key))
   _inflight.set(key, promise)
   ```

2. **`src/__tests__/runtime/use-fetch-component.test.ts`** — add tests:
   - Two concurrent `refresh()` calls with the same key → only one fetch issued
   - Deduplication resolves both callers with the same data
   - After resolution, `_inflight` is cleared (next call issues a new fetch)

3. **`docs/data-loading.md`** (or equivalent) — document client deduplication behavior.

---

## P2-4 — No lazy-loaded component support

### Diagnosis

All component registration calls (`component('ks-badge', renderFn)`) are eager and
synchronous. There is no equivalent of Vue's `defineAsyncComponent` or React's
`React.lazy()` — no way to split a component's implementation into a separate chunk that
loads on first render rather than at page load.

This is distinct from per-page code splitting (which is implemented): the gap is
**within-page** lazy loading of heavy components (e.g., a rich text editor, a chart
library, a code editor) that may not always render on first paint.

### Fix design

Add `defineAsyncComponent(loader: () => Promise<RenderFunction>)` to the runtime:

```ts
// app/components/heavy-editor.ts
export default defineAsyncComponent(() =>
  import('./heavy-editor-impl.ts').then(m => m.default)
)

// Usage in a page:
component('my-page', () => {
  return html`<heavy-editor></heavy-editor>`
})
```

Internally, `defineAsyncComponent` returns a render function that:
1. On first render: returns a placeholder (empty or user-specified `loading` slot)
2. Triggers the `loader()` Promise
3. When the Promise resolves: registers the real component, requests a re-render

The framework already handles async component streaming in SSR (swap scripts). The client
path needs to wire into the existing on-demand registration mechanism.

### Implementation steps

**Project:** `@jasonshimmy/custom-elements-runtime`

1. **`src/lib/runtime/component/async-component.ts`** (new file):
   - `defineAsyncComponent(loader, options?)` function
   - Options: `loading?: RenderFunction`, `error?: RenderFunction`, `timeout?: number`
   - Internal state machine: `idle → loading → resolved | error | timeout`

2. **`src/lib/runtime/component/factory.ts`** — detect when the render function is
   an async-component wrapper and handle the loading/resolved states in the render pipeline.

3. **`src/lib/index.ts`** — export `defineAsyncComponent`.

4. **`src/lib/vite-plugin.ts`** — `extractComponentRegistrations` must recognize
   `defineAsyncComponent` calls in addition to `component()` calls so the component
   manifest is built correctly.

5. **Tests:**
   - `test/async-component.spec.ts`:
     - Renders placeholder on first mount
     - Renders resolved content after loader settles
     - Renders error component on loader rejection (when error option provided)
     - Timeout option: renders error state if loader takes too long

6. **`docs/components.md`** — document `defineAsyncComponent`.

---

## P2-5 — `adoptedStyleSheets` not used; component styles are embedded `<style>` tags

### Diagnosis

The SSR DSD output embeds `<style>` inside each `<template shadowrootmode="open">` block.
On the client, when a component upgrades its shadow root from DSD, the styles are already
inline. The framework does not use `adoptedStyleSheets` (the `CSSStyleSheet` API) for
any component styles.

The gap vs. Nuxt/Next.js is that `adoptedStyleSheets` allows **style deduplication**:
if 50 instances of `<ks-badge>` are on the page, there is currently one `<style>` block
per shadow root (50 total). With `adoptedStyleSheets`, a single `CSSStyleSheet` object
is constructed once and shared across all 50 instances via `shadowRoot.adoptedStyleSheets`.

This is a performance optimization for pages with many repeated component instances.
It does not affect correctness.

### Fix design

After client-side hydration, the `component()` factory can detect whether a component
uses a CSS block from the `css\`` helper and, if `CSSStyleSheet` is supported (Chrome 73+,
Firefox 101+, Safari 16.4+), adopt a shared stylesheet instead of per-instance `<style>`.

SSR output remains unchanged (DSD requires inline `<style>`). The optimization is purely
client-side post-hydration.

Since `adoptedStyleSheets` is broadly but not universally supported, the implementation
must gate on `typeof CSSStyleSheet !== 'undefined' && 'replace' in CSSStyleSheet.prototype`.

### Implementation steps

**Project:** `@jasonshimmy/custom-elements-runtime`

1. **`src/lib/runtime/component/factory.ts`** — in the shadow root setup path (post-DSD
   upgrade), detect CSS content and, when `CSSStyleSheet` is supported:
   ```ts
   const sheet = new CSSStyleSheet()
   sheet.replaceSync(cssContent)
   shadowRoot.adoptedStyleSheets = [sheet]
   // Remove the inline <style> block from the shadow root DOM
   shadowRoot.querySelector('style')?.remove()
   ```
   Store sheets in a `Map<tagName, CSSStyleSheet>` at module level for reuse.

2. **`src/lib/runtime/ssr/` (DSD serializer)** — no change; SSR still emits inline
   `<style>` as required by the DSD specification.

3. **Tests:**
   - `test/adopted-stylesheets.spec.ts` (JSDOM does not support `adoptedStyleSheets`
     fully; use a mock or skip when unsupported):
     - Two instances of the same component share the same `CSSStyleSheet` object
     - Graceful fallback: when `CSSStyleSheet.prototype.replace` is absent, inline
       `<style>` is retained

4. **`docs/components.md`** — add a note about `adoptedStyleSheets` optimization.

---

## Summary

| # | Priority | Issue | Project |
|---|---|---|---|
| P0-1 | Critical | SSR render errors crash the response stream | vite-plugin-cer-app |
| P0-2 | Critical | ISR concurrent revalidation race condition | vite-plugin-cer-app |
| P0-3 | Critical | Async SSR components can hang indefinitely | custom-elements-runtime |
| P0-4 | Critical | Reactive subscriptions leak on component disconnect | custom-elements-runtime |
| P1-1 | Minor | No 404 fallback when catch-all route is absent | vite-plugin-cer-app |
| P1-2 | Minor | Server middleware limited to status 500 | vite-plugin-cer-app |
| P1-3 | Minor | Session secret is not rotatable | vite-plugin-cer-app |
| P1-4 | Minor | Cloudflare adapter has no size check for inlined HTML | vite-plugin-cer-app |
| P1-5 | Minor | Auto-import injects full import groups | vite-plugin-cer-app |
| P2-1 | Feature | Nested routes / meta inheritance via `_layout.ts` | vite-plugin-cer-app |
| P2-2 | Feature | Per-route error components | vite-plugin-cer-app |
| P2-3 | Feature | Client-side `useFetch()` deduplication | vite-plugin-cer-app |
| P2-4 | Feature | Lazy-loaded components (`defineAsyncComponent`) | custom-elements-runtime |
| P2-5 | Feature | `adoptedStyleSheets` for style deduplication | custom-elements-runtime |

---

## Non-goals

The following ❌ items from the audit comparison table are explicitly deferred:

- **Partial Prerendering (PPR)**: Requires Server Components, a different rendering model.
- **Parallel routes**: Niche use case; `layoutChain` covers most real needs.
- **Server Components (RSC)**: Fundamentally incompatible with the Web Components model.
- **Module ecosystem / Devtools**: Community and tooling; not implementable in this codebase.
