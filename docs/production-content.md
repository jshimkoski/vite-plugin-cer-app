# Production content, islands and quality checks

Use `renderContent(doc, { components })` inside a page template when trusted, generated Markdown contains registered custom elements. It parses the body into VNodes and lets CER render registered components into declarative shadow DOM. `unsafeHTML()` retains its literal insertion behavior. Neither API sanitizes untrusted input.

Load component data before rendering, rather than fetching it only in `useOnConnected()`:

```ts
export const loader = async () => ({
  doc: await queryContent('/guide').first(),
  related: await queryContent('/guide').find(),
})
component('page-guide', () => {
  const { doc, related } = usePageData<{ doc: ContentItem; related: ContentItem[] }>()!
  return html`<article>${renderContent(doc, {
    components: { 'document-list': { items: related } },
  })}</article>`
})
```

Resolvers can be functions of a tag's attributes, allowing multiple lists on one page to receive different filtered data. Pass serializable props to interactive children of a `hydrate: 'none'` parent; CER serializes their island props. Keep large metadata arrays filtered to what each island actually needs.

Browser component imports are selected by document path and by content items in the page loader data or hosts already rendered in static shadow DOM, so `/reader` can render a document whose `_path` is `/guide`. Server registrations remain static. Configure downloading separately from CER's component hydration:

```ts
export default defineConfig({
  content: { components: {
    'feature-gallery': 'visible',
    'static-details': 'none',
  } },
  ssg: {
    entryPreload: path => path !== '/guide',
    sitemap: path => path === '/' ? { images: ['/hero.webp'] } : {},
    netlifyForms: [{ name: 'contact', fields: ['name', 'email', 'message'], honeypot: 'bot-field' }],
  },
})
```

The `none` download policy skips the implementation on the initial static document; client navigation imports implementations needed to render new content. `visible` imports near the viewport and preserves click/keyboard activation. Hydration is still declared on the component. Native links remain immediately usable. `entryPreload` controls hints, not whether startup JavaScript exists.

`useContentSeo(doc, { robots: 'index,follow,max-image-preview:large' })` accepts a policy; missing documents stay noindex. Sitemap metadata accepts `lastmod`, `images` and `exclude`. Supply real modification dates. Keep nonindexable pages excluded from the sitemap.

Netlify form registration is generated in `dist/form-dummy/index.html` from the declared schema. Use the same schema for the actual native form. The registration document stays hidden and noindex; verify deployed submissions in Netlify when releasing.

## Static CSS

```ts
jitCss: { mode: 'static', safelist: ['bg-primary-500', 'dark:text-neutral-100'] }
```

Static mode installs build-generated utility/prose CSS in shadow roots and avoids bundling the runtime JIT generator. The default scan includes application source and Markdown. Classes constructed from arbitrary data must be in a scanned literal or the safelist; extend `jitCss.content` for external source components. Runtime JIT remains the default and supports genuinely dynamic classes. `cerMaterial()` contributes semantic colors automatically; application overrides take precedence.

For responsive media use explicit dimensions, `picture`/`srcset` and a truthful `sizes` attribute. Load the actual hero eagerly with high priority and preload only its matching responsive source. Use native lazy images/iframes below the fold. Keep content data and image processing in the application or an optional build integration.

## Preview and deployment

`cer-app preview` uses Vite preview for TLS, media types, compression and range requests, with CER routing for slashless SSG documents, dedicated noindex 404s, API dispatch and SSR/ISR. Configure Vite preview options under `preview`. Preview is a local build check; deployment adapters provide platform entrypoints.

`generate` delegates to `build --mode ssg`, including configured adapters. Invalid configuration and failed SSG renders fail the command by default. `ssg.failOnError: false` is for deliberate partial output. Pure-static output prunes intermediate `client`/`server` trees; fallback/hybrid/adapter builds retain them, and preview protects private server files. Use `keepServer: true` for custom consumers.

Preview and adapters use the exported server dispatcher. ISR bypasses query, cookie, authorization and non-GET requests, always-server routes, error/private/Set-Cookie responses and unsupported Vary keys. Cached anonymous documents use stale-while-revalidate and bounded process-local storage. Cold cache renders buffer the complete document; background refresh is not guaranteed to complete after a serverless response. See [rendering modes](./rendering-modes.md) for limits.

Adapters preserve server dispatch for fallback/hybrid builds. Static publication excludes server/client intermediates and build manifests. Cloudflare's advanced-mode worker forwards public assets through `env.ASSETS`, blocks private build URLs and retains dynamic HTML routing. Both its server and static adapters transform `dist` into deployment output and remove retained server/client intermediates; rebuild to recover those intermediates before selecting another adapter.

Vercel (Node 24) and Cloudflare output bundle the full server graph, including lazy chunks and external CER libraries, so their server entrypoints do not depend on the source checkout's `node_modules`. Server builds embed the published content snapshot; large content collections increase worker size and memory. Netlify uses its platform bundler for the function and imports the generated server bundle. Packages requiring native binaries or external filesystem assets need a platform-specific packaging strategy. Validate each adapter locally with `npm run e2e:integration:netlify`, `npm run e2e:integration:vercel`, `npm run e2e:integration:cloudflare` and `npm run e2e:integration:cloudflare:workers`, then smoke-test the target deployment.

## Quality gates

```sh
cer-app check links
cer-app check seo --site-url https://example.com
cer-app check performance --page /guide --max-initial-js 86000
```

Budget reports traverse the build graph and inline bootstrap imports, including selected startup content modules. Preload bytes are reported separately. No preloads does not mean zero startup JavaScript.

Install Lighthouse as an optional application development dependency, then create a script:

```js
import { runLighthouseSuite } from '@jasonshimmy/vite-plugin-cer-app/quality'
const report = await runLighthouseSuite({
  runs: 3,
  profiles: [
    { name: 'home-mobile', path: '/' },
    { name: 'home-desktop', path: '/', preset: 'desktop' },
    { name: 'returning', path: '/', cookies: ['consent=accepted; Path=/'], thresholds: { performance: 1 } },
  ],
})
if (report.failures.length) throw new Error(report.failures.join('\n'))
```

The suite owns direct HTTPS preview and cleanup, discovers Chromium-family browsers, and retains full reports, raw metrics and a summary under `.cer/reports/lighthouse/<unique-run>/`. HTTPS uses supplied Vite TLS options or a temporary certificate generated with `openssl`; choose `https: false` explicitly for HTTP. Thresholds are fractions from 0 to 1 and default to 1. Complement scores with no-JavaScript semantic checks and real keyboard/form tests.
