import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../kitchen-sink', import.meta.url))
rmSync(join(root, 'dist'), { recursive: true, force: true })
rmSync(join(root, 'node_modules', '.cer-app-cache'), { recursive: true, force: true })
// Adapter outputs — cleaned so every test run starts from a known state.
rmSync(join(root, '.netlify'), { recursive: true, force: true })
rmSync(join(root, 'netlify'), { recursive: true, force: true })
rmSync(join(root, '.vercel'), { recursive: true, force: true })
// Cloudflare: _worker.js sits inside dist/ (cleaned above); wrangler.toml at root.
rmSync(join(root, 'wrangler.toml'), { force: true })
console.log('[e2e] Cleaned kitchen-sink/dist, cache, and adapter outputs')
