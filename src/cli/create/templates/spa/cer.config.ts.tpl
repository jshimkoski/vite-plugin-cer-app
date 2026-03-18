import { defineConfig } from 'vite-plugin-cer-app'

export default defineConfig({
  mode: 'spa',
  autoImports: { components: true, composables: true, directives: true, runtime: true },
})
