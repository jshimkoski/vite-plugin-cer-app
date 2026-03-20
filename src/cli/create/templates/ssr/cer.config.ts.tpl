import { defineConfig } from '@jasonshimmy/vite-plugin-cer-app'

export default defineConfig({
  mode: 'ssr',
  ssr: {
    dsd: true,
  },
  autoImports: { components: true, composables: true, directives: true, runtime: true },
})
