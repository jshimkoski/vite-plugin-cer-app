{
  "name": "{{projectName}}",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "cer-app dev",
    "build": "cer-app build",
    "generate": "cer-app generate",
    "preview": "cer-app preview",
    "typecheck": "tsc --noEmit",
    "validate": "npm run typecheck && npm run build && cer-app check links && cer-app check performance"
  },
  "dependencies": {
    "@jasonshimmy/custom-elements-runtime": "^3.9.1"
  },
  "devDependencies": {
    "@jasonshimmy/vite-plugin-cer-app": "^{{pluginVersion}}",
    "typescript": "^7.0.2",
    "vite": "^8.3.0"
  }
}
