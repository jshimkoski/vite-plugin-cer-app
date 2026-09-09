import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  mode: 'ssg',
  ssg: {
    routes: 'auto',
    concurrency: 4,
    // Inline only small stylesheets to avoid render blocking without bloating HTML.
    inlineStylesheets: 20 * 1024,
  },
  autoImports: { components: true, composables: true, directives: true, runtime: true },
})
