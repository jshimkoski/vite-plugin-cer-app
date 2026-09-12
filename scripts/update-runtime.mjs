import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const RUNTIME_PACKAGE = '@jasonshimmy/custom-elements-runtime'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeLockKey = `node_modules/${RUNTIME_PACKAGE}`
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function assertDependency(manifest, field, label) {
  const dependencies = assertRecord(manifest[field], `${label}.${field}`)
  if (typeof dependencies[RUNTIME_PACKAGE] !== 'string') {
    throw new Error(`${label}.${field} must declare ${RUNTIME_PACKAGE}`)
  }
  return dependencies
}

function assertRelease(release) {
  const value = assertRecord(release, 'Runtime release metadata')
  if (typeof value.version !== 'string' || !semverPattern.test(value.version)) {
    throw new Error(`Invalid runtime version: ${String(value.version)}`)
  }
  if (typeof value.tarball !== 'string' || !value.tarball.startsWith('https://')) {
    throw new Error('Runtime release metadata is missing a secure tarball URL')
  }
  if (typeof value.integrity !== 'string' || !value.integrity) {
    throw new Error('Runtime release metadata is missing dist.integrity')
  }
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const dependencies = value[field] ?? {}
    assertRecord(dependencies, `Runtime release ${field}`)
    if (Object.keys(dependencies).length > 0) {
      throw new Error(
        `${RUNTIME_PACKAGE}@${value.version} is not zero-dependency (${field} is not empty)`,
      )
    }
  }
  return value
}

function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function updateProjectManifest(source, version) {
  const manifest = assertRecord(JSON.parse(source), 'package.json')
  const peerDependencies = assertDependency(manifest, 'peerDependencies', 'package.json')
  const devDependencies = assertDependency(manifest, 'devDependencies', 'package.json')
  peerDependencies[RUNTIME_PACKAGE] = `>=${version}`
  devDependencies[RUNTIME_PACKAGE] = `^${version}`
  return serializeJson(manifest)
}

function updateTemplateManifest(source, version, label) {
  const manifest = assertRecord(JSON.parse(source), label)
  const dependencies = assertDependency(manifest, 'dependencies', label)
  dependencies[RUNTIME_PACKAGE] = `^${version}`
  return serializeJson(manifest)
}

function updatePackageLock(source, release) {
  const lock = assertRecord(JSON.parse(source), 'package-lock.json')
  const packages = assertRecord(lock.packages, 'package-lock.json.packages')
  const rootPackage = assertRecord(packages[''], 'package-lock.json.packages[""]')
  const installedRuntime = assertRecord(
    packages[runtimeLockKey],
    `package-lock.json.packages["${runtimeLockKey}"]`,
  )
  const peerDependencies = assertDependency(
    rootPackage,
    'peerDependencies',
    'package-lock.json root package',
  )
  const devDependencies = assertDependency(
    rootPackage,
    'devDependencies',
    'package-lock.json root package',
  )

  peerDependencies[RUNTIME_PACKAGE] = `>=${release.version}`
  devDependencies[RUNTIME_PACKAGE] = `^${release.version}`
  installedRuntime.version = release.version
  installedRuntime.resolved = release.tarball
  installedRuntime.integrity = release.integrity
  if (typeof release.license === 'string' && release.license) {
    installedRuntime.license = release.license
  }
  delete installedRuntime.dependencies
  delete installedRuntime.peerDependencies
  delete installedRuntime.peerDependenciesMeta
  delete installedRuntime.optionalDependencies

  return serializeJson(lock)
}

async function findTemplateManifests(directory) {
  const matches = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      matches.push(...(await findTemplateManifests(path)))
    } else if (entry.name === 'package.json.tpl') {
      matches.push(path)
    }
  }
  return matches.sort()
}

export async function fetchRuntimeRelease(version = 'latest', options = {}) {
  const registry = String(
    options.registry ?? process.env.npm_config_registry ?? 'https://registry.npmjs.org/',
  )
  const registryURL = new URL(registry.endsWith('/') ? registry : `${registry}/`)
  const packagePath = encodeURIComponent(RUNTIME_PACKAGE)
  const releaseURL = new URL(`${packagePath}/${encodeURIComponent(version)}`, registryURL)
  const response = await fetch(releaseURL, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(
      `Unable to read ${RUNTIME_PACKAGE}@${version} from npm (${response.status} ${response.statusText})`,
    )
  }
  const metadata = assertRecord(await response.json(), 'npm registry response')
  const dist = assertRecord(metadata.dist, 'npm registry response.dist')
  return assertRelease({
    version: metadata.version,
    tarball: dist.tarball,
    integrity: dist.integrity,
    license: metadata.license,
    dependencies: metadata.dependencies,
    peerDependencies: metadata.peerDependencies,
    optionalDependencies: metadata.optionalDependencies,
  })
}

export async function updateRuntimeReferences(options) {
  const root = resolve(options.root)
  const release = assertRelease(options.release)
  const packagePath = join(root, 'package.json')
  const lockPath = join(root, 'package-lock.json')
  const templatePaths = await findTemplateManifests(
    join(root, 'src', 'cli', 'create', 'templates'),
  )
  if (templatePaths.length === 0) {
    throw new Error('No create-app package.json.tpl files were found')
  }

  const paths = [packagePath, lockPath, ...templatePaths]
  const sources = await Promise.all(paths.map((path) => readFile(path, 'utf8')))
  const outputs = [
    updateProjectManifest(sources[0], release.version),
    updatePackageLock(sources[1], release),
    ...sources.slice(2).map((source, index) =>
      updateTemplateManifest(source, release.version, relative(root, templatePaths[index])),
    ),
  ]
  const changed = paths.filter((_, index) => sources[index] !== outputs[index])

  if (!options.checkOnly) {
    await Promise.all(
      changed.map((path) => {
        const index = paths.indexOf(path)
        return writeFile(path, outputs[index], 'utf8')
      }),
    )
  }

  return {
    version: release.version,
    changed: changed.map((path) => relative(root, path)),
  }
}

export function parseArguments(argv) {
  let checkOnly = false
  let version = 'latest'
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--check') {
      checkOnly = true
    } else if (argument === '--version') {
      version = argv[++index]
      if (!version) throw new Error('--version requires a value')
    } else if (argument === '--help' || argument === '-h') {
      return { help: true, checkOnly, version }
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  return { help: false, checkOnly, version }
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2))
  if (arguments_.help) {
    console.log(`Usage: npm run update:runtime -- [--check] [--version <version>]

Checks npm for the latest ${RUNTIME_PACKAGE} release and synchronizes the
plugin peer/dev dependency, package lock, and every create-app template.`)
    return
  }

  const release = await fetchRuntimeRelease(arguments_.version)
  const result = await updateRuntimeReferences({
    root: projectRoot,
    release,
    checkOnly: arguments_.checkOnly,
  })

  if (result.changed.length === 0) {
    console.log(`${RUNTIME_PACKAGE}@${result.version} is already current.`)
    return
  }

  const files = result.changed.map((path) => `  - ${path}`).join('\n')
  if (arguments_.checkOnly) {
    console.error(
      `${RUNTIME_PACKAGE}@${result.version} is available. Update required in:\n${files}`,
    )
    process.exitCode = 1
    return
  }

  console.log(`Updated ${RUNTIME_PACKAGE} references to ${result.version}:\n${files}`)
}

const isDirectRun = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
