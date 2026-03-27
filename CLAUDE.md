# Claude Code Instructions — vite-plugin-cer-app

This file contains project-specific instructions for Claude Code. Follow all rules below without exception.

---

## Project overview

`vite-plugin-cer-app` is a Vite plugin / meta-framework built on top of `@jasonshimmy/custom-elements-runtime`. It provides file-based routing, SSR/SSG/SPA rendering modes, auto-imports, virtual modules, and a composables layer. All source code is TypeScript.

---

## NON-NEGOTIABLE requirements

Every change — feature, bug fix, refactor — MUST satisfy all of the following before it is considered complete:

### 1. Documentation
- All new features must be **fully documented** in the relevant `docs/*.md` file.
- Documentation must include: configuration options, API reference, usage examples, and known edge cases.
- If a feature affects auto-imports, update `docs/configuration.md` (the auto-imports list).
- If a feature adds a composable, add a full entry to `docs/composables.md`.
- If a feature affects routing, update `docs/routing.md`.
- If a feature affects middleware, update `docs/middleware.md`.
- Documentation must be 100% accurate with the actual implementation — never document behavior that does not exist.

### 2. Tests — unit
- All new features must include **unit tests** using Vitest in `src/__tests__/`.
- Tests must cover: typical usage, edge cases, and failure/error paths.
- Never reduce existing test coverage.

### 3. Tests — e2e
- All new features must include **Cypress e2e tests** in `e2e/cypress/e2e/`.
- E2e tests must cover typical usage and edge cases across all applicable build modes: SPA, SSR, SSG, and dev.
- Add any required fixtures (kitchen-sink pages, middleware, components) to `e2e/kitchen-sink/`.
- **NEVER run Cypress yourself.** Only the user runs Cypress. When e2e tests are ready, ask the user to run `npm run e2e` and report the results.

### 4. Auto-imports
- All new framework composables must be wired into `src/plugin/transforms/auto-import.ts` (`FRAMEWORK_IMPORTS` string + `FRAMEWORK_IDENTIFIERS` array).
- Verify the auto-import works in pages, layouts, components, and middleware by adding a test to `src/__tests__/plugin/transforms/auto-import.test.ts`.

### 5. TypeScript
- All new code must be **strongly typed** — no `any`, no implicit `any`.
- Prefer `interface` over `type` for object shapes.
- All new public types must be exported from `src/types/` and re-exported from the package's type entry point.
- The TypeScript compiler must not produce new errors. Run `npm run build` to verify.

### 6. Validation
- `npm run validate` (which runs `lint && npm test && npm run build && npm run e2e`) **MUST pass** before any change is considered complete.
- The AI-runnable subset is `npm run lint && npm test && npm run build`. Run these yourself before asking the user to run Cypress.
- Do not mark work as done if lint errors, type errors, or failing unit tests exist.

---

## Important behaviors

### Never run Cypress
Cypress is run exclusively by the user. The AI must:
1. Write the Cypress test file(s).
2. Confirm lint + unit tests + build pass.
3. Ask the user to run `npm run e2e` (or `npm run validate`) and report the results.

### Virtual modules
Virtual module IDs follow the pattern `virtual:cer-*`. They are resolved with a `\0` prefix in the Vite plugin's `resolveId` hook. Adding a new virtual module requires updating `VIRTUAL_IDS` in `src/plugin/index.ts` and the corresponding `generateVirtualModule` switch branch.

### Auto-imports
`src/plugin/transforms/auto-import.ts` injects framework composables into page/layout/component/middleware files. Adding a new composable requires:
- Appending the identifier to `FRAMEWORK_IMPORTS` (the import statement string).
- Adding it to `FRAMEWORK_IDENTIFIERS` (the array used to detect usage).

### SSR isolation
Per-request state uses `AsyncLocalStorage`. New per-request stores must follow the pattern in existing stores (create → run → cleanup) and be initialized in the request handler.

### Kitchen-sink app
`e2e/kitchen-sink/` is the test harness app. Every new feature needs at least one kitchen-sink page/component that exercises the feature so Cypress has something to test.

---

## Commands reference

| Command | Purpose |
|---|---|
| `npm run build` | Production build (plugin + types) |
| `npm test` | Vitest unit tests |
| `npm run test:coverage` | Unit test coverage report |
| `npm run lint` | ESLint + TypeScript check |
| `npm run e2e` | Cypress e2e tests (user only) |
| `npm run validate` | Full pipeline: lint → test → build → e2e |

---

## File layout

```
src/
  plugin/           — Vite plugin implementation
    virtual/        — Virtual module generators
    transforms/     — Code transforms (auto-import, etc.)
  runtime/          — Composables and runtime helpers
    composables/    — useLocale, useCookie, useState, etc.
  cli/              — CLI commands (build, adapt, dev)
  types/            — Shared TypeScript interfaces
  __tests__/        — Unit tests (mirrors src/ structure)

e2e/
  kitchen-sink/     — Test harness app
    app/pages/      — Test pages
    app/middleware/ — Test middleware
    cer.config.ts   — Kitchen-sink config
  cypress/
    e2e/            — Cypress specs

docs/               — Markdown documentation
```
