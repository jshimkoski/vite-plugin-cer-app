// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

let connected: (() => void | (() => void)) | undefined
let watched: (() => void) | undefined

vi.mock('@jasonshimmy/custom-elements-runtime', () => ({
  ref: <T>(value: T) => ({ value }),
  useOnConnected: (callback: () => void | (() => void)) => { connected = callback },
  watch: vi.fn((_source: () => unknown, callback: () => void) => {
    watched = callback
    return vi.fn()
  }),
  nextTick: () => Promise.resolve(),
}))

import { useActiveHeadings } from '../../runtime/composables/use-active-headings.js'

class FakeIntersectionObserver {
  static current: FakeIntersectionObserver | undefined
  callback: IntersectionObserverCallback
  observed: Element[] = []
  disconnect = vi.fn()

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    FakeIntersectionObserver.current = this
  }

  observe(element: Element) {
    this.observed.push(element)
  }

  fire(entries: Array<Partial<IntersectionObserverEntry> & { target: Element }>) {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
  }
}

describe('useActiveHeadings', () => {
  beforeEach(() => {
    connected = undefined
    watched = undefined
    FakeIntersectionObserver.current = undefined
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })

  it('observes heading elements and updates active IDs without scroll listeners', async () => {
    const install = document.createElement('h2')
    const configure = document.createElement('h3')
    install.id = 'install'
    configure.id = 'configure'
    const root = {
      querySelector: (selector: string) => selector.includes('install') ? install : configure,
    } as unknown as ParentNode
    const state = useActiveHeadings([
      { depth: 2, id: 'install', text: 'Install' },
      { depth: 3, id: 'configure', text: 'Configure' },
    ], { root })

    const cleanup = connected?.() as (() => void)
    await Promise.resolve()
    await Promise.resolve()
    const observer = FakeIntersectionObserver.current!
    expect(observer.observed).toEqual([install, configure])

    observer.fire([{ target: install, isIntersecting: true }])
    expect(state.activeIds.value).toEqual(['install'])
    expect(state.isActive('install')).toBe(true)

    observer.fire([
      { target: install, isIntersecting: false },
      { target: configure, isIntersecting: true },
    ])
    expect(state.activeIds.value).toEqual(['configure'])

    cleanup()
    expect(observer.disconnect).toHaveBeenCalledOnce()
  })

  it('selects the first section when all headings begin below the activation band', async () => {
    const install = document.createElement('h2')
    install.id = 'install'
    const configure = document.createElement('h2')
    configure.id = 'configure'
    const root = {
      querySelector: (selector: string) => selector.includes('install') ? install : configure,
    } as unknown as ParentNode
    const state = useActiveHeadings([
      { depth: 2, id: 'install', text: 'Install' },
      { depth: 2, id: 'configure', text: 'Configure' },
    ], { root, offset: 96 })

    connected?.()
    await Promise.resolve()
    await Promise.resolve()
    FakeIntersectionObserver.current?.fire([
      {
        target: install,
        isIntersecting: false,
        boundingClientRect: { top: 420 } as DOMRectReadOnly,
      },
      {
        target: configure,
        isIntersecting: false,
        boundingClientRect: { top: 900 } as DOMRectReadOnly,
      },
    ])

    expect(state.activeIds.value).toEqual(['install'])
  })

  it('waits for the navigation DOM commit before its initial observation', async () => {
    const install = document.createElement('h2')
    install.id = 'install'
    const renderedRoot = {
      querySelector: () => install,
    } as unknown as ParentNode
    let root: ParentNode | null = null

    useActiveHeadings(
      [{ depth: 2, id: 'install', text: 'Install' }],
      { root: () => root },
    )
    connected?.()
    root = renderedRoot
    await Promise.resolve()
    await Promise.resolve()

    expect(FakeIntersectionObserver.current?.observed).toEqual([install])
  })

  it('re-observes changed headings after the new page DOM has rendered', async () => {
    const oldHeading = document.createElement('h2')
    oldHeading.id = 'old-heading'
    const newHeading = document.createElement('h2')
    newHeading.id = 'new-heading'
    let renderedHeading = oldHeading
    const root = {
      querySelector: (selector: string) =>
        selector.includes(renderedHeading.id) ? renderedHeading : null,
    } as unknown as ParentNode
    const headings = {
      value: [{ depth: 2, id: 'old-heading', text: 'Old heading' }],
    }

    useActiveHeadings(headings, { root })
    connected?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(FakeIntersectionObserver.current?.observed).toEqual([oldHeading])

    // Reactive props change before the parent's DOM patch has installed the
    // new article. Re-observation must wait for that patch to settle.
    headings.value = [{ depth: 2, id: 'new-heading', text: 'New heading' }]
    watched?.()
    renderedHeading = newHeading
    await Promise.resolve()
    await Promise.resolve()

    expect(FakeIntersectionObserver.current?.observed).toEqual([newHeading])
  })
})
