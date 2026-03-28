# Changelog

All notable changes to this project will be documented in this file.
## [v0.17.1] - 2026-03-28

- fix: update dependencies and improve error handling in server templates (0f12ef5)

## [v0.17.0] - 2026-03-27

- feat: add component code-splitting and tests (db7c4c7)

## [v0.16.0] - 2026-03-27

- feat: add internationalization (i18n) support with locale-aware routing (a38407c)
- docs: add defineOAuthProvider helper and tests for OAuth configuration test: enhance useRoute and useCookie tests for better error handling test: implement tests for defineServerMiddleware functionality test: add tests for OAuth routes in generateServerApiCode test: improve useFetch tests with refresh functionality test: update useHead tests for new script handling (797ef05)
- docs: update authentication, components, composables, configuration, data loading, head management, middleware, plugins, routing, testing, use-fetch, and use-state documentation for clarity and accuracy (322d181)

## [v0.15.0] - 2026-03-26

- feat: implement useState composable for globally-keyed reactive state management (f8aae38)
- docs: update inaccuracies (69b807d)

## [v0.14.1] - 2026-03-26

- fix: downgrade typescript (0278d24)
- fix: add missing dts definitions for composables chore: update dependencies and improve type declarations (546c99c)

## [v0.14.0] - 2026-03-25

- feat: add programmatic navigation and route handling (37a583b)

## [v0.13.1] - 2026-03-22

- fix: optimize imports in Cloudflare and Netlify adapters to remove unused handler export (cc74ce3)

## [v0.13.0] - 2026-03-22

- feat: implement streaming Web API Response support in Cloudflare and Netlify adapters (bfe00e3)

## [v0.12.1] - 2026-03-22

- fix: add meta.hydrate support for route hydration strategies and implement related tests (0513743)

## [v0.12.0] - 2026-03-22

- feat: implement ISR support with isrHandler for SSR fallback in Cloudflare, Netlify, and Vercel adapters (ddcc4d4)

## [v0.11.0] - 2026-03-22

- feat: add Cloudflare Pages adapter for SSR and SSG support (2734c26)

## [v0.10.0] - 2026-03-22

- feat: add adapters for Vercel and Netlify deployment platforms (7112bf6)

## [v0.9.0] - 2026-03-21

- feat: add useCookie and useSeoMeta composables with tests (6536902)

## [v0.8.0] - 2026-03-21

- feat: add middleware support and enhance runtime configuration (78ef4d2)

## [v0.7.0] - 2026-03-21

- feat: add per-route render strategies and error handling in ISR (d76fb89)

## [v0.6.0] - 2026-03-21

- feat(ssr): switch server entry from renderToStringWithJITCSSDSD to renderToStreamWithJITCSSDSD for true incremental streaming (cca67d8)

## [v0.5.0] - 2026-03-21

- feat: add runtime configuration support and ISR enhancements (847cd25)

## [v0.4.6] - 2026-03-21

- fix: merge extraneous templates (7a859bd)

## [v0.4.5] - 2026-03-21

- fix: remove the dsd config option since we always want it on anyway. (3698886)

## [v0.4.4] - 2026-03-21

- fix: bootstrap .cer/tsconfig.json during config loading for improved resolution (f8bda65)

## [v0.4.3] - 2026-03-21

- fix: fix DSD config and update FOUC tests to DSD correctness tests and enhance assertions (a8d36a3)
- chore: update eslint (5a367e0)

## [v0.4.2] - 2026-03-21

- fix: update dependencies in project templates to latest versions (1390724)

## [v0.4.1] - 2026-03-21

- fix: update app entry point to use virtual module path /@cer/app.ts across templates and tests (139abaf)

## [v0.4.0] - 2026-03-20

- feat: implement useInject composable for consistent value injection across SPA, SSR, and SSG fix: cer app hidden directory issue (f614e92)

## [v0.3.0] - 2026-03-20

- feat: add default .gitignore templates for SPA, SSR, and SSG projects fix: remove unused streaming ssr option fix: generated .cer directory to get out of the way of the user (8656788)

## [v0.2.0] - 2026-03-20

- feat: introduce generated directory for app files and HTML (c8fdcdd)

## [v0.1.6] - 2026-03-20

- fix: update CLI usage instructions to include --package flag for create-cer-app (457114d)

## [v0.1.5] - 2026-03-20

- fix: use vite plugin for light dom jit css fix: update incorrect docs fix: fix the plugin config (c32cf6a)

## [v0.1.4] - 2026-03-20

- fix: fixed many issues across the plugin fix: added e2e tests to ensure functionality works across build types fix:improve documentation (fb24d84)

## [v0.1.3] - 2026-03-19

- fix: FOUC in ssr and ssg (e4fb53d)

## [v0.1.2] - 2026-03-19

- fix(build): fix SSR and SSG build modes (23d5363)

## [v0.1.1] - 2026-03-18

- fix: rename vite-plugin-cer-app usage to @jasonshimmy/vite-plugin-cer-app (60c4bdf)

## [v0.1.0] - 2026-03-18

- fix: add nvmrc (7065201)
- feat: add publishing capability (812152b)
- initial commit (43a8365)


