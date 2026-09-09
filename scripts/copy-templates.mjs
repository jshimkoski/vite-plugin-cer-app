import { chmod, cp, mkdir } from 'node:fs/promises'

const destination = new URL('../dist/cli/create/templates/', import.meta.url)
await mkdir(destination, { recursive: true })
await cp(
  new URL('../src/cli/create/templates/', import.meta.url),
  destination,
  { recursive: true, force: true },
)

// TypeScript creates JavaScript outputs with the process default mode. Restore
// the executable bit required by package.json `bin`, including for file-linked
// packages whose bin shim points directly at these files.
await Promise.all([
  chmod(new URL('../dist/cli/index.js', import.meta.url), 0o755),
  chmod(new URL('../dist/cli/create/index.js', import.meta.url), 0o755),
])
