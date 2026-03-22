// Kitchen sink configuration — mode is overridden by --mode CLI flag
export default {
  ssg: { routes: 'auto', concurrency: 2 },
  autoImports: { runtime: true, components: true, composables: true },
  runtimeConfig: {
    public: {
      appName: 'Kitchen Sink',
    },
    private: {
      // Resolved from SESSION_SECRET env var at server startup.
      // A hardcoded fallback is used here so e2e tests work without env setup.
      sessionSecret: 'kitchen-sink-e2e-test-secret-at-least-32-chars!',
    },
  },
}
