# Implementation Plan: Per-Page Component Code Splitting

## Background

Currently `virtual:cer-components` eagerly imports every file in `app/components/` as a
side-effect import at app startup. With 500 components, all 500 load on every route — even
routes that use only one of them.

Pages are already lazy-loaded via dynamic `import()` in the router. The goal is to make
component loading follow the same pattern: only the components a page actually uses are
loaded when that page is visited.

---

## Core insight

The module dependency graph and the template dependency graph are disconnected. In
React/Vue/Svelte, `import Button from './Button'` gives Rollup a graph edge it can optimize.
Here, `<ks-badge>` inside an `html` template literal is invisible to Rollup — it is just a
string.

The fix: reconnect the two graphs at build time by converting implicit string-based deps into
explicit `import` statements via a Vite `transform` hook. Once that is done, Rollup handles
everything else — code splitting, chunk deduplication, `modulepreload` hints, transitive deps
— automatically and permanently.

---

## Logic audit

Every load-bearing assumption verified before writing a single line of code.

**1. Static imports in page files create Rollup graph edges.**
When the transform injects `import "/components/ks-badge.ts"` at the top of
`pages/index.ts`, and `pages/index.ts` is dynamically imported by the router
(`import('./pages/index.ts')`), Rollup bundles `ks-badge.ts` into that lazy chunk (or a
shared chunk if used across multiple pages). No manual chunk configuration needed. ✅

**2. Execution order is guaranteed.**
ES module semantics require all static imports to fully execute before the importing module's
own body runs. `ks-badge.ts` calls `component('ks-badge', ...)` → `customElements.define()`
before `page-index`'s `component()` call. The element is always defined before it can appear
in a template. ✅

**3. False positives from the tag regex are harmless.**
The regex will match `<ks-badge>` in comments or string literals outside `html``. This causes
an extra `import` to be injected. The component gets registered but never rendered. Cost: a
few extra bytes and one idempotent `customElements.define()` call. Not a correctness issue.
Line and block comments are stripped before scanning to minimize noise.

**4. False negatives are impossible for the `html\`` pattern.**
Tag names in `html` template literals are always in the static string parts of the template.
They can never appear inside a `${...}` interpolation and still function as registered custom
elements. The static regex is exhaustive for this API.

**5. Transitive dependencies resolve for free.**
When `page-index.ts` imports `ks-card.ts` (injected by transform), and `ks-card.ts` uses
`<ks-badge>`, the transform also runs on `ks-card.ts` and injects its own import for
`ks-badge.ts`. Rollup traces the full graph. No recursive analysis needed in our code.

**6. Built-in components are correctly excluded.**
`<cer-error-boundary>`, `<cer-suspense>`, `<cer-keep-alive>` have hyphens and are found by
the regex. But they are not in the manifest (they live in the runtime, not `app/components/`).
No import is injected for them. They continue to be registered via `registerBuiltinComponents()`. ✅

**7. SSR works without `virtual:cer-components`.**
The server imports all routes. Each route's page file has static component imports injected by
the transform. Importing a page transitively imports its components. For SSG all routes are
rendered so all components are imported. For SSR per-request, the first render of a route
imports its components for all subsequent requests. The `component()` function in the runtime
already guards `customElements.define()` with `if (typeof window !== 'undefined')`, so
importing a component file on the server side registers it in the in-memory registry (needed
for SSR rendering) without touching the browser API. ✅

**8. Layout components are correctly handled.**
`virtual:cer-layouts` still eagerly imports all layout files. The transform runs on layout
files too. Layout component imports are injected as static side-effect imports in each layout
file. Since layouts are eagerly loaded, their components load eagerly — correct, since layouts
are global. ✅

**9. `autoImports.components: false` must be respected.**
When this flag is false the user opts out of automatic component handling. The transform must
be skipped entirely, matching existing opt-out semantics. Users who set this flag manage
component imports manually.

**10. Multiple `component()` calls in one file.**
Some component files register more than one element. `extractComponentRegistrations` must
return all of them. Use `matchAll`, not `match`.

**11. Source maps must not be broken.**
Injecting lines at the top of a file shifts all original line numbers. Returning `map: null`
breaks debugger accuracy. Use `magic-string` with `prepend()` + `generateMap({ hires: true })`
to produce a correct shifted map.

**12. The transform must run on the original TypeScript source.**
Without `enforce: 'pre'`, Vite may run other transforms (esbuild TypeScript compilation,
other plugins) before ours. Once TypeScript is compiled to JS, template literal patterns may
differ. Using `enforce: 'pre'` guarantees we always see the raw `.ts` source.

---

## Holes found and fixed in this plan

The following issues were identified during review and are addressed in the implementation
steps below. They are listed here so the reasoning is traceable.

| # | Hole | Fix applied |
|---|---|---|
| H1 | `id.endsWith('.ts')` fails when Vite appends query strings (`?v=abc`, `?t=123`) | Strip query string: `id.split('?')[0]` before all checks |
| H2 | `id.startsWith(appRoot)` matches sibling dirs (`/src` matches `/src2/`) | Normalize `appRoot` to always end with `/` before comparison |
| H3 | `buildStart` runs once; adding a new component file mid-session leaves manifest stale | Add `watchChange` hook handling `create` and `delete` events |
| H4 | `magic-string` as a dependency violates the zero-dependency constraint of the runtime | Implement the source map directly using VLQ — no library needed (see Step 3) |
| H5 | `enforce: 'pre'` missing; transform may see already-compiled output | Add `enforce: 'pre'` to the plugin |
| H6 | `resolve()` returns backslash paths on Windows; `import "C:\\..."` is fragile | Normalize all manifest paths to forward slashes at insertion time |
| H7 | `server.moduleGraph.idToModuleMap` type varies across Vite versions (`ModuleNode` vs `Set<ModuleNode>`) | Use `server.moduleGraph.fileToModulesMap` (stable, maps `filePath → Set<ModuleNode>`) |
| H8 | Failure table claimed "manifest rebuilt on next `buildStart`" for HMR additions — `buildStart` does not re-run on HMR | Fixed in table; H3's `watchChange` hook is the real fix |
| H9 | Windows: `file` argument in `handleHotUpdate` and `watchChange` may use backslashes | Normalize incoming `file` paths to forward slashes before manifest lookups |
| H10 | Injecting absolute paths into `import` statements exposes machine-local paths in build output | Use paths relative to the importing file's directory instead of absolute paths |
| H11 | `handleHotUpdate` iterates `idToModuleMap` which includes virtual modules with `\0` prefix; `mod.id` access is unsafe | Switch to `fileToModulesMap` which only contains real file paths |
| H12 | Component modifications that don't change the tag name send an unnecessary `full-reload`; Vite's own HMR would have handled it | Only send `full-reload` when the manifest actually changes (tag set before ≠ tag set after) |
| H13 | `sources: [id]` in the VLQ source map uses the raw Vite module ID which may still contain query strings | Use `cleanId` (already stripped above) for the `sources` field |
| H14 | `watchChange` fires via Vite's internal watcher pipeline; the meta-framework's chokidar `add` handler may fire first and send full-reload before the manifest is updated | Safe in practice: `addFileToManifest` is synchronous (`readFileSync`); the full-reload WebSocket message requires a browser round-trip before any new module request arrives, so the manifest is always current. Documented explicitly rather than silently relied upon. |
| H15 | Plan referenced `config.componentsDir` / `config.srcDir` at array-construction time, but `config` in `index.ts` is a lazily-resolved closure set in `buildStart`, not available at plugin creation | Use `resolvedForJit` (already eagerly computed at the same point as `jitPlugins`) — consistent with existing pattern |
| H16 | Exact `return` statement in `index.ts` not shown, leaving ambiguous where the spread goes | Explicit return statement shown in Step 2 |

---

## Project 1 — `@jasonshimmy/custom-elements-runtime`

### Step 1 — Extract `resolveTagName` into a shared internal module

**Create** `src/lib/runtime/tag-utils.ts`:

```ts
import { toKebab } from './helpers';

/**
 * Resolves a component() tag argument to the actual registered tag name.
 * Single source of truth used by both factory.ts (runtime) and
 * vite-plugin.ts (build time) so the two can never drift apart.
 *
 * Rules:
 *   camelCase → kebab-case   (myButton  → my-button)
 *   no hyphen  → cer- prefix (app       → cer-app)
 *   has hyphen → unchanged   (ks-badge  → ks-badge)
 */
export function resolveTagName(name: string): string {
  const kebab = toKebab(name);
  return kebab.includes('-') ? kebab : `cer-${kebab}`;
}
```

**Update** `src/lib/runtime/component/factory.ts`:

```ts
// Replace the two-line normalization block (lines 126-129) with:
import { resolveTagName } from '../tag-utils';
// ...
const normalizedTag = resolveTagName(tag);
```

This is the single change that eliminates all possible drift between runtime and build-time
tag resolution.

---

### Step 2 — Add three pure utilities to `src/lib/vite-plugin.ts`

These are Node-only build-time utilities, identical in pattern to the existing
`extractClassesFromHTML` used by `cerJITCSS`.

```ts
// ─── re-export so consumers have one import surface ──────────────────────────
export { resolveTagName } from './runtime/tag-utils';

// ─── extractTemplateTagNames ──────────────────────────────────────────────────
/**
 * Scan TypeScript source text for all custom element tag names referenced
 * in html`` template literals.
 *
 * Strips line (//) and block (/* *\/) comments first to avoid false
 * positives from commented-out code. HTML comments inside templates
 * (<!-- -->) are intentionally NOT stripped; a tag inside an HTML comment
 * is still a false positive but is harmless (idempotent registration).
 *
 * Returns a Set of already-hyphenated tag names as they appear in the source
 * (e.g. "ks-badge", "cer-app"). Single-word names that would receive a
 * "cer-" prefix at runtime never appear as bare tags in templates — they
 * always appear as "cer-something" — so no normalization is needed here.
 *
 * Closing tags (</ks-badge>) do NOT match because the regex requires the
 * first character after < to be [a-z], not /.
 */
export function extractTemplateTagNames(source: string): Set<string> {
  const stripped = source
    .replace(/\/\/[^\n]*/g, '')        // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // block comments

  const tags = new Set<string>();
  // Requires at least one hyphen-segment: matches custom elements only,
  // never native HTML elements like <div> or <span>.
  for (const m of stripped.matchAll(/<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)/g)) {
    tags.add(m[1]);
  }
  return tags;
}

// ─── extractComponentRegistrations ───────────────────────────────────────────
/**
 * Extract all component tag names registered in a component source file.
 * Handles files that call component() more than once (returns all of them).
 *
 * Uses \bcomponent\( so it matches the standalone function name but not
 * names like importComponent( or registerComponent(.
 *
 * \s* after the opening paren matches optional whitespace including newlines,
 * so multi-line call signatures are handled correctly.
 *
 * Returns resolved (normalized) tag names, ready to match against the output
 * of extractTemplateTagNames().
 */
export function extractComponentRegistrations(source: string): string[] {
  const stripped = source
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const tags: string[] = [];
  for (const m of stripped.matchAll(/\bcomponent\(\s*['"`]([^'"`]+)['"`]/g)) {
    tags.push(resolveTagName(m[1]));
  }
  return tags;
}
```

---

### Step 3 — Add `cerComponentImports` Vite plugin to `src/lib/vite-plugin.ts`

```ts
import type { Plugin, ViteDevServer } from 'vite';
import { resolve, relative, dirname } from 'node:path';

export interface CerComponentImportsOptions {
  /**
   * Absolute path to the directory containing component files.
   * Every .ts file found here is scanned for component() registrations.
   */
  componentsDir: string;
  /**
   * Absolute path to the app source root. The transform is restricted to
   * files under this directory so node_modules and generated files are skipped.
   * Must NOT include a trailing slash — the plugin normalizes this internally.
   */
  appRoot: string;
}

export function cerComponentImports(options: CerComponentImportsOptions): Plugin {
  // Normalize both roots to forward slashes + trailing slash for reliable
  // startsWith checks that don't accidentally match sibling directories.
  // e.g. appRoot "/src" would match "/src2/foo" without the trailing slash.
  const componentsDir = options.componentsDir.replace(/\\/g, '/').replace(/\/?$/, '/');
  const appRoot      = options.appRoot.replace(/\\/g, '/').replace(/\/?$/, '/');

  // tag name → absolute file path (forward-slash normalized)
  const manifest = new Map<string, string>();

  function addFileToManifest(absPath: string): void {
    const normalized = absPath.replace(/\\/g, '/');
    try {
      const src = readFileSync(normalized, 'utf-8');
      for (const tag of extractComponentRegistrations(src)) {
        manifest.set(tag, normalized);
      }
    } catch {
      // Skip unreadable files
    }
  }

  function removeFileFromManifest(absPath: string): void {
    const normalized = absPath.replace(/\\/g, '/');
    for (const [tag, path] of manifest.entries()) {
      if (path === normalized) manifest.delete(tag);
    }
  }

  function buildManifest(): void {
    manifest.clear();
    if (!existsSync(options.componentsDir)) return;
    for (const rel of globSync('**/*.ts', { cwd: options.componentsDir })) {
      addFileToManifest(resolve(options.componentsDir, rel));
    }
  }

  return {
    name: 'cer-component-imports',
    // Must run before esbuild/TypeScript compilation so we always see the
    // original html`` template literal strings, not compiled output.
    enforce: 'pre',

    buildStart() {
      buildManifest();
    },

    // watchChange fires for file create/delete events in both dev and build.
    // handleHotUpdate (below) fires for file modifications in dev only.
    watchChange(id: string, { event }: { event: 'create' | 'update' | 'delete' }) {
      const normalized = id.replace(/\\/g, '/');
      if (!normalized.startsWith(componentsDir) || !normalized.endsWith('.ts')) return;

      if (event === 'delete') {
        removeFileFromManifest(normalized);
      } else {
        // 'create' or 'update': remove stale entries then re-add
        removeFileFromManifest(normalized);
        addFileToManifest(normalized);
      }
      // Note: for 'create'/'delete', the meta-framework's own watcher already
      // sends a full-reload. For 'update', handleHotUpdate takes over below.
    },

    transform(code: string, id: string) {
      // Strip Vite query strings (?v=abc, ?t=123, ?import, etc.) before checks.
      const cleanId = id.split('?')[0].replace(/\\/g, '/');

      // Only transform .ts files inside the app source root.
      // The trailing-slash-normalized appRoot prevents false matches on
      // sibling directories (e.g. /src matching /src2/).
      if (!cleanId.endsWith('.ts') || !cleanId.startsWith(appRoot)) return null;

      // Quick bail-out: if the file has no html`` calls it cannot reference
      // components via templates. This avoids running the regex on utility
      // files, composables, middleware, etc.
      if (!code.includes('html`')) return null;

      const usedTags = extractTemplateTagNames(code);
      if (usedTags.size === 0) return null;

      const injections: string[] = [];
      for (const tag of usedTags) {
        const componentFile = manifest.get(tag);
        if (componentFile) {
          // Use a path relative to the file being transformed rather than an
          // absolute path. Absolute paths expose machine-local directory
          // structure in build output and are fragile on Windows.
          const rel = relative(dirname(cleanId), componentFile).replace(/\\/g, '/');
          const importPath = rel.startsWith('.') ? rel : `./${rel}`;
          injections.push(`import ${JSON.stringify(importPath)};`);
        }
      }
      if (injections.length === 0) return null;

      const prefix = injections.join('\n') + '\n';
      const newCode = prefix + code;

      // Generate a zero-dependency source map for the "prepend N lines" case.
      //
      // Because this plugin runs with enforce:'pre', it always sees the raw
      // file from disk — there is no prior source map to chain. The transform
      // is purely additive (prepend only), so the mapping has an exact known
      // structure:
      //
      //   • N injected lines → N semicolons (empty mapping segments, no source)
      //   • original line 1  → "AAAA" (col 0 → source 0, line 0, col 0 — all deltas 0)
      //   • original line k  → "AACA" (col 0, source 0, +1 line delta, col 0)
      //
      // VLQ cheat sheet for the values used here:
      //   0 → A,  +1 → C
      //   Segment [genCol, srcIdx, origLine, origCol] = four VLQ characters
      //
      // This produces a correct, debugger-friendly source map with zero
      // external dependencies.
      const injectedLineCount = injections.length;
      const originalLineCount = code.split('\n').length;
      const mappings =
        ';'.repeat(injectedLineCount) +       // injected lines: no source position
        'AAAA' +                               // first original line (all deltas = 0)
        ';AACA'.repeat(originalLineCount - 1); // remaining lines (+1 line delta each)

      return {
        code: newCode,
        map: {
          version: 3 as const,
          // Use cleanId (query-stripped, forward-slash normalised) not raw id.
          // The sources array must point to the file path, not a Vite module ID
          // with decorations like ?v=abc appended.
          sources: [cleanId],
          sourcesContent: [code],
          names: [],
          mappings,
        },
      };
    },

    handleHotUpdate({ file, server }: { file: string; server: ViteDevServer }) {
      const normalized = file.replace(/\\/g, '/');
      if (!normalized.startsWith(componentsDir) || !normalized.endsWith('.ts')) return;

      // Snapshot the manifest tags for this file before and after the update.
      const before = new Set(
        [...manifest.entries()].filter(([, p]) => p === normalized).map(([t]) => t),
      );

      removeFileFromManifest(normalized);
      addFileToManifest(normalized);

      const after = new Set(
        [...manifest.entries()].filter(([, p]) => p === normalized).map(([t]) => t),
      );

      // If the registered tag names didn't change (common case: developer only
      // edited the component's render logic), Vite's standard HMR propagation
      // is sufficient. The page module is already in Vite's module graph as a
      // dependent of the component file (via the injected static import), so
      // Vite will invalidate and re-render it automatically.
      const manifestChanged =
        before.size !== after.size ||
        [...before].some((t) => !after.has(t));

      if (!manifestChanged) return;

      // Tag names changed (e.g. developer renamed a component). Injected imports
      // in page/layout files are now stale. Invalidate all app .ts modules so
      // the transform re-runs with the updated manifest on the next request,
      // then trigger a full page reload.
      for (const [filePath, mods] of server.moduleGraph.fileToModulesMap) {
        const normalizedPath = filePath.replace(/\\/g, '/');
        if (normalizedPath.startsWith(appRoot) && normalizedPath.endsWith('.ts')) {
          for (const mod of mods) {
            server.moduleGraph.invalidateModule(mod);
          }
        }
      }
      server.ws.send({ type: 'full-reload' });
    },
  };
}
```

**No new dependencies.** The source map is computed from first principles using only the VLQ
structure that is guaranteed when prepending lines to a file with no prior transform. The
runtime's zero-dependency constraint is fully preserved.

---

### Step 4 — Tests (runtime)

Add `test/vite-plugin-utils.test.ts`. The `cerComponentImports` plugin transform can be
tested by calling `plugin.transform(code, id)` directly with a mock manifest state (call
`plugin.buildStart()` after stubbing `globSync` and `readFileSync`).

| Test | Input | Expected |
|---|---|---|
| `resolveTagName` — no hyphen | `'app'` | `'cer-app'` |
| `resolveTagName` — camelCase | `'myButton'` | `'my-button'` |
| `resolveTagName` — already kebab | `'ks-badge'` | `'ks-badge'` |
| `resolveTagName` — PascalCase | `'MyCard'` | `'my-card'` |
| `extractTemplateTagNames` — basic | source with `<ks-badge>` | `Set(['ks-badge'])` |
| `extractTemplateTagNames` — line comment | `// <ks-badge>` | empty Set |
| `extractTemplateTagNames` — block comment | `/* <ks-badge> */` | empty Set |
| `extractTemplateTagNames` — closing tag | `</ks-badge>` only | empty Set |
| `extractTemplateTagNames` — native tag | `<div>` | empty Set |
| `extractTemplateTagNames` — self-closing | `<ks-badge />` | `Set(['ks-badge'])` |
| `extractComponentRegistrations` — single quotes | `component('ks-badge', ...)` | `['ks-badge']` |
| `extractComponentRegistrations` — double quotes | `component("my-btn", ...)` | `['my-btn']` |
| `extractComponentRegistrations` — camelCase arg | `component('myBtn', ...)` | `['my-btn']` |
| `extractComponentRegistrations` — multiline | `component(\n  'ks-badge',` | `['ks-badge']` |
| `extractComponentRegistrations` — multiple calls | two `component()` calls | both tags |
| `extractComponentRegistrations` — commented call | `// component('old', ...)` | `[]` |
| `extractComponentRegistrations` — non-standalone name | `importComponent('x', ...)` | `[]` |
| transform — injects import for known tag | page source `<ks-badge>` + manifest entry | relative import prepended |
| transform — file outside appRoot | `id` outside `appRoot` | returns `null` |
| transform — no `html\`` in file | source without template literal | returns `null` |
| transform — tag not in manifest | `<unknown-tag>` | returns `null` |
| transform — Vite query string on id | `id` ends in `?v=abc` | strips suffix, still transforms |
| transform — source map | check returned `map.mappings` | N leading semicolons + `AAAA` + N-1 `;AACA` segments |
| `watchChange` — create | new component file | tag added to manifest |
| `watchChange` — delete | component file removed | tag removed from manifest |
| `handleHotUpdate` — no tag change | same tags before and after | no full-reload sent |
| `handleHotUpdate` — tag renamed | tag set changes | full-reload sent, app modules invalidated |

---

## Project 2 — `vite-plugin-cer-app`

### Step 1 — Delete `src/plugin/virtual/components.ts`

This file is entirely replaced by the runtime plugin. Delete it.

---

### Step 2 — Update `src/plugin/index.ts`

**Remove:**
- `import { generateComponentsCode } from './virtual/components.js'`
- `components: 'virtual:cer-components'` from `VIRTUAL_IDS`
- `case RESOLVED_IDS.components: return generateComponentsCode(config.componentsDir)` from
  the `load` hook
- `if (filePath.startsWith(config.componentsDir)) dirty.push(RESOLVED_IDS.components)` from
  `getDirtyVirtualIds`

**Add:**

```ts
import { cerComponentImports } from '@jasonshimmy/custom-elements-runtime/vite-plugin'
```

`config` in `cerApp` is a lazily-resolved closure variable populated in `buildStart`, so it
is not available at array-construction time. The correct variable is `resolvedForJit`, which
is already eagerly computed at the same point where `jitPlugins` is configured. Use it for
`cerComponentImports` too, keeping both consistent:

```ts
// Existing (unchanged):
const resolvedForJit = resolveConfig(userConfig)
const { content, ...jitOptions } = resolvedForJit.jitCss
const jitPlugins = cerPlugin({ content, ...jitOptions, ssr: { dsd: true, jit: jitOptions } })

// Updated return — explicit so the spread position is unambiguous:
return [
  cerAppPlugin,
  ...jitPlugins,
  ...(resolvedForJit.autoImports?.components !== false
    ? [cerComponentImports({
        componentsDir: resolvedForJit.componentsDir,
        appRoot: resolvedForJit.srcDir,
      })]
    : []),
]
```

The `autoImports.components` flag is preserved exactly. When `false`, no transform runs and
the user manages imports manually.

---

### Step 3 — Update `src/runtime/app-template.ts`

Remove the line: `import 'virtual:cer-components'`

This is a string template (the content of `.cer/app.ts`). Remove only that one line from the
template string. All other imports remain unchanged.

---

### Step 4 — Update `src/runtime/entry-server-template.ts`

Remove the line: `import 'virtual:cer-components'`

Same as above — string template, one line removal.

---

### Step 5 — Update `src/plugin/dts-generator.ts`

Remove the line: `declare module 'virtual:cer-components' {}`

---

### Step 6 — Update unit tests

- **Delete** `src/__tests__/plugin/virtual/components.test.ts`
- **Update** `src/__tests__/plugin/cer-app-plugin.test.ts`:
  - Remove the `vi.mock` for `generateComponentsCode`
  - Remove the `resolves virtual:cer-components` test
  - Remove the `loads virtual:cer-components module code` test
  - Add: assert that `cerComponentImports` appears in the plugin array when
    `autoImports.components` is unset or `true`
  - Add: assert that `cerComponentImports` does NOT appear when
    `autoImports.components` is `false`
- **Update** `src/__tests__/plugin/entry-server-template.test.ts`:
  - Remove the assertion that the template contains `virtual:cer-components`
  - Add the inverse: assert it does NOT contain `virtual:cer-components`
- **Update** `src/__tests__/plugin/app-template.test.ts`:
  - Same inverse assertion if a parallel test exists

---

### Step 7 — Update e2e kitchen-sink

Add a second kitchen-sink page that intentionally does NOT use `<ks-badge>`.

Add a Cypress spec (`e2e/cypress/e2e/component-splitting.cy.ts`) that:

1. Intercepts all network requests with `cy.intercept('GET', '**/ks-badge*')`
2. Visits the route that does NOT use `<ks-badge>` — asserts the intercept was never called
3. Visits the route that DOES use `<ks-badge>` — asserts the component renders and the chunk
   was fetched on demand

Do not run Cypress. Ask the user to run `npm run e2e` and report results.

---

### Step 8 — Update docs

- `docs/components.md`: document that components are now automatically code-split per page;
  explain that components used in layouts load eagerly (by design); note the
  `autoImports.components: false` escape hatch
- `docs/configuration.md`: update the `autoImports.components` entry to reflect new behavior

---

## Failure mode reference

| Concern | Why it cannot break |
|---|---|
| Registration timing | Static import semantics: all imports execute before the importing module's body |
| Transitive deps (`ks-card` uses `ks-badge`) | Transform runs on `ks-card.ts` too; Rollup traces the full graph |
| Built-in runtime components | Not in `componentsDir`; not in manifest; unaffected |
| `autoImports.components: false` | Transform is not added to the plugin array; behavior identical to today |
| SSR / SSG | Page imports chain to component imports via static deps; `component()` guards `customElements.define` with `typeof window !== 'undefined'` |
| Layouts | Eagerly imported → transform runs on layout files → their component deps load eagerly ✅ |
| HMR: component file added | `watchChange` event `create` updates manifest synchronously via `readFileSync`; meta-framework watcher sends full-reload via WebSocket; the browser round-trip guarantees manifest is current before any module request arrives |
| HMR: component file deleted | `watchChange` event `delete` removes manifest entry synchronously; same round-trip guarantee applies |
| HMR: component implementation changes (tag unchanged) | Vite's own HMR propagates through the static import edge; no full-reload needed |
| HMR: component tag renamed | `handleHotUpdate` detects manifest change → invalidates app modules → full-reload |
| Source maps | Zero-dependency VLQ prepend map: N semicolons for injected lines + identity mapping for original lines; correct because `enforce:'pre'` guarantees no prior transform |
| Multiple `component()` per file | `extractComponentRegistrations` uses `matchAll`; returns all tags |
| Non-filename tag names | Manifest built from source parse, not filename convention; works regardless of naming |
| Vite query strings on module IDs | `id.split('?')[0]` strips before all path checks |
| Sibling directory false match | Both `appRoot` and `componentsDir` normalized to trailing `/` before `startsWith` |
| Windows backslash paths | All paths normalized to forward slashes at manifest insertion and in the transform |
| `idToModuleMap` API variance | Uses `fileToModulesMap` (stable across Vite versions, maps path → `Set<ModuleNode>`) |
| `magic-string` availability | Listed under `dependencies`, not `devDependencies`; always installed with the package |
| Transform order | `enforce: 'pre'` guarantees we see original TypeScript source, not compiled output |
| Relative import paths | Import paths are relative to the transformed file; no absolute or machine-local paths in output |

---

---

## Treeshaking audit — everything else

The user asked whether any other aspect of the project requires treeshaking changes. The
following was verified against the current source:

| Aspect | Status | Evidence |
|---|---|---|
| `src/runtime/composables/index.ts` | ✅ No changes needed | All 25 exports are individual named re-exports. No `export *`. Zero module-level executable code. |
| `src/types/index.ts` | ✅ No changes needed | All `export type` and one `export { defineConfig }`. Zero side effects. |
| `src/index.ts` (main entry) | ✅ No changes needed | Named exports and `export type` only. Zero side effects. |
| Auto-imports (`auto-import.ts`) | ✅ No changes needed | `FRAMEWORK_IMPORTS` uses named destructuring from `@jasonshimmy/vite-plugin-cer-app/composables`. Named imports are treeshakable at the point of use in user code. |
| `package.json` `exports` field | ✅ No changes needed | All five entry points use conditional `import`/`require`/`types` objects. |
| `package.json` `sideEffects` field | ⚠️ One-line fix | Field is absent, which defaults to `true` (Webpack assumes all files have side effects). This only matters for Webpack consumers — Rollup/Vite tree-shake correctly regardless. Fix: `"sideEffects": ["**/*.css"]`. This is outside the scope of this plan but is the only remaining gap. |
| Component loading (the focus of this plan) | ✅ Fixed by this plan | `virtual:cer-components` replaced by per-page static imports via the transform. |

**Conclusion:** No additional treeshaking work is required beyond this plan. The optional
`sideEffects` field addition (one line in `package.json`) would benefit Webpack-based
consumers but is not needed for Vite/Rollup users.

---

## Known limitations

- **Circular component dependencies** (A uses `<ks-b>`, B uses `<ks-a>`) produce a circular
  ESM import graph. This is a pre-existing application-level design problem unrelated to this
  change. Rollup processes circular ESM deps without crashing, but component registration
  order in a true cycle is undefined.
- **`autoImports.components: false`** requires users to manually `import` their component
  files wherever they are used. Previously this flag only suppressed the virtual module; now
  it also disables the transform. The user-visible effect is the same (no automatic wiring)
  but the mechanism changed.
- **Components outside `componentsDir`** are not scanned. If a project places components in a
  non-standard location, those components must be imported manually or `componentsDir` must be
  reconfigured.
- **String literals containing tag-like patterns** (e.g. `const x = '<ks-badge>'` outside of
  `html``…``) will cause an unnecessary import to be injected. The component gets registered
  but never renders — harmless.
