import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    environmentOptions: {
      happyDom: {
        // Prevent happy-dom from attempting to fetch external script files
        settings: {
          disableJavaScriptFileLoading: true,
          disableJavaScriptEvaluation: true,
          disableComputedStyleRendering: true,
        },
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli/**',
        'src/runtime/app-template.ts',
        'src/runtime/entry-client-template.ts',
        'src/runtime/entry-server-template.ts',
        'src/__tests__/**',
      ],
    },
  },
})
