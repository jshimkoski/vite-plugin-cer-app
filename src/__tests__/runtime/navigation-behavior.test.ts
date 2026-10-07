// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { generateAppEntryTemplate } from '../../runtime/app-template.js'
const APP_ENTRY_TEMPLATE = generateAppEntryTemplate()

function harness(load: (path: string) => Promise<unknown>) {
  // Execute the emitted browser loader itself, with only transport dependencies replaced.
  const start = APP_ENTRY_TEMPLATE.indexOf('let _currentPageTag = null')
  const end = APP_ENTRY_TEMPLATE.indexOf('const _push = router.push.bind(router)')
  const router = { matchRoute: (path: string) => ({ route: { load: () => load(path) }, params: {} }), replace: vi.fn(), getCurrent: () => ({ path: '/' }) }
  const context: Record<string, unknown> = {}
  const generated = APP_ENTRY_TEMPLATE.slice(start, end).replaceAll('globalThis', 'context')
  const state = new Function('router', 'ref', 'loadContentComponents', 'context', `${generated}\nreturn { load: _loadPageForPath, retry: resetError, state: () => ({ tag: _currentPageTag, attrs: _currentPageAttrs, error: currentError.value, data: context.__CER_DATA__ }) }`)(router, (value: unknown) => ({ value }), async () => {}, context)
  return { ...state, router }
}
afterEach(() => vi.restoreAllMocks())

it('aborts an older loader and prevents its data or error from replacing a newer route', async () => {
  let rejectOld!: (error: Error) => void, oldSignal!: AbortSignal
  const app = harness(async (path) => ({ default: path, loader: ({ signal }: { signal: AbortSignal }) => path === '/old' ? new Promise((_resolve, reject) => { oldSignal = signal; rejectOld = reject }) : Promise.resolve({ title: 'Newest' }) }))
  const old = app.load('/old')
  await vi.waitFor(() => expect(oldSignal).toBeDefined())
  await app.load('/new')
  expect(oldSignal.aborted).toBe(true)
  rejectOld(new Error('Stale error'))
  await old
  expect(app.state()).toEqual({ tag: '/new', attrs: { title: 'Newest' }, error: null, data: { title: 'Newest' } })
})

it('surfaces a route import failure and retries its query and fragment intact', async () => {
  const app = harness(async () => { throw new Error('Chunk unavailable') })
  await app.load('/broken?filter=recent#chapter')
  expect(app.state().error).toBe('Chunk unavailable')
  app.retry()
  expect(app.router.replace).toHaveBeenCalledWith('/broken?filter=recent#chapter')
  expect(app.state().error).toBeNull()
})
