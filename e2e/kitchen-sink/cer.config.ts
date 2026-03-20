// Kitchen sink configuration — mode is overridden by --mode CLI flag
export default {
  ssr: { dsd: true, streaming: false },
  ssg: { routes: 'auto', concurrency: 2 },
  autoImports: { runtime: true, components: true, composables: true },
}
