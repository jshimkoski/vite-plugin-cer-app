import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  mode: 'spa',
  autoImports: { components: true, composables: true, directives: true, runtime: true },
})
