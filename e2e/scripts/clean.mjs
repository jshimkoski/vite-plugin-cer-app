import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../kitchen-sink', import.meta.url))
rmSync(join(root, 'dist'), { recursive: true, force: true })
rmSync(join(root, 'node_modules', '.cer-app-cache'), { recursive: true, force: true })
console.log('[e2e] Cleaned kitchen-sink/dist and cache')
