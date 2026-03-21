import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  mode: 'ssr',
  autoImports: { components: true, composables: true, directives: true, runtime: true },
})
