import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { startPreview, closePreview } from '../commands/preview.js'
import { runLighthouseAudit, LIGHTHOUSE_CATEGORIES, type LighthouseUrlReport } from './lighthouse.js'
export { startPreview, closePreview } from '../commands/preview.js'
export { checkPerformanceBudgets } from './performance.js'
export { checkBuiltLinks } from './links.js'
export { checkSeo } from './seo.js'
export { runLighthouseAudit, findChromiumExecutable } from './lighthouse.js'

export interface LighthouseProfile {
  name: string
  path: string
  preset?: 'desktop'
  /** Local preview response cookies for a returning-visitor profile. */
  cookies?: string[]
  thresholds?: Partial<Record<typeof LIGHTHOUSE_CATEGORIES[number], number>>
}
export interface LighthouseSuiteOptions {
  root?: string
  profiles: LighthouseProfile[]
  runs?: number
  attempts?: number
  port?: number
  chromePath?: string
  /** Default true: direct Vite HTTP/2 preview. Requires openssl or supplied TLS options. */
  https?: boolean | import('vite').PreviewOptions['https']
  reportsDir?: string
  thresholds?: LighthouseProfile['thresholds']
}
export interface LighthouseSuiteReport { profiles: Array<LighthouseUrlReport & { name: string }>; failures: string[] }

/** Own preview lifecycle and retain scores, raw metrics and the full optional Lighthouse reports. */
export async function runLighthouseSuite(options: LighthouseSuiteOptions): Promise<LighthouseSuiteReport> {
  for (const [name, value] of Object.entries({ runs: options.runs ?? 3, attempts: options.attempts ?? 1 })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  }
  for (const profile of options.profiles) {
    if (!profile.path.startsWith('/') || profile.path.startsWith('//')) throw new Error(`Profile ${profile.name} must use a local path`)
    for (const threshold of Object.values({ ...options.thresholds, ...profile.thresholds })) {
      if (!Number.isFinite(threshold) || threshold! < 0 || threshold! > 1) throw new Error('Lighthouse thresholds must be between 0 and 1')
    }
  }
  const names = options.profiles.map((profile) => profile.name)
  if (new Set(names).size !== names.length) throw new Error('Lighthouse profile names must be unique')
  const root = resolve(options.root ?? process.cwd())
  const certificates = await mkdtemp(join(tmpdir(), 'cer-audit-cert-'))
  let https = options.https === false ? undefined : typeof options.https === 'object' ? options.https : undefined
  const parent = resolve(options.reportsDir ?? join(root, '.cer/reports/lighthouse'))
  await mkdir(parent, { recursive: true })
  const reportsDir = await mkdtemp(join(parent, new Date().toISOString().replace(/[:.]/g, '-') + '-'))
  console.log(`[lighthouse] Reports: ${reportsDir}`)
  const result: LighthouseSuiteReport = { profiles: [], failures: [] }
  try {
    if (options.https !== false && !https) {
      const key = join(certificates, 'key.pem'), cert = join(certificates, 'cert.pem')
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' })
      https = { key: readFileSync(key), cert: readFileSync(cert) }
    }
    for (const profile of options.profiles) {
      if (!/^[a-z0-9][a-z0-9_-]*$/i.test(profile.name)) throw new Error(`Invalid profile name: ${profile.name}`)
      const server = await startPreview({ root, host: '127.0.0.1', port: options.port ?? 4173, preview: { https, headers: profile.cookies?.length ? { 'Set-Cookie': profile.cookies } : undefined } })
      try {
        const url = new URL(profile.path, server.resolvedUrls?.local[0] ?? `${https ? 'https' : 'http'}://127.0.0.1:${options.port ?? 4173}`).href
        const [report] = await runLighthouseAudit({ root, urls: [url], runs: options.runs, attempts: options.attempts, preset: profile.preset, chromePath: options.chromePath, ignoreCertificateErrors: !!https, reportsDir: join(reportsDir, profile.name), onRun: (_url, run, scores, metrics) => {
          console.log(`[lighthouse] ${profile.name} run ${run}: ${Object.entries(scores).map(([key, value]) => `${key}=${Math.round(value * 100)}`).join(' ')}; ${Object.entries(metrics).map(([key, value]) => `${key}=${value.toFixed(3)}`).join(' ')}`)
        } })
        result.profiles.push({ ...report, name: profile.name })
        for (const category of LIGHTHOUSE_CATEGORIES) {
          const threshold = profile.thresholds?.[category] ?? options.thresholds?.[category] ?? 1
          if ((report.medians[category] ?? 0) < threshold) result.failures.push(`${profile.name}: ${category}=${Math.round(report.medians[category] * 100)} (required ${threshold * 100})`)
        }
        console.log(`[lighthouse] ${profile.name} median: ${JSON.stringify(report.medians)}`)
      } finally { await closePreview(server) }
    }
    await writeFile(join(reportsDir, 'summary.json'), JSON.stringify(result, null, 2))
    return result
  } finally { await rm(certificates, { recursive: true, force: true }) }
}
