import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  mode: 'ssg',
  ssg: {
    routes: 'auto',
    concurrency: 4,
  },
  ssr: {
    dsd: true,
  },
  autoImports: { components: true, composables: true, directives: true, runtime: true },
})
