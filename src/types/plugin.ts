import type { Router } from '@jasonshimmy/custom-elements-runtime/router'
import type { CerAppConfig } from './config.js'

export interface AppContext {
  provide(key: PropertyKey, value: unknown): void
  router: Router
  config: CerAppConfig
}

export interface AppPlugin {
  name: string
  setup(app: AppContext): void | Promise<void>
}
