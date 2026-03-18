import { describe, it, expect } from 'vitest'
import {
  fileToRoutePath,
  fileToTagName,
  fileToLayoutTagName,
  fileToLayoutName,
  fileToImportAlias,
  extractPluginOrder,
  sortPluginFiles,
  sortRoutes,
  isRouteDynamic,
  isRouteCatchAll,
  buildRouteEntry,
} from '../../plugin/path-utils.js'

const PAGES = '/project/app/pages'
const LAYOUTS = '/project/app/layouts'

// ─── fileToRoutePath ────────────────────────────────────────────────────────

describe('fileToRoutePath', () => {
  it('maps index.ts to /', () => {
    expect(fileToRoutePath(`${PAGES}/index.ts`, PAGES)).toBe('/')
  })

  it('maps about.ts to /about', () => {
    expect(fileToRoutePath(`${PAGES}/about.ts`, PAGES)).toBe('/about')
  })

  it('maps blog/index.ts to /blog', () => {
    expect(fileToRoutePath(`${PAGES}/blog/index.ts`, PAGES)).toBe('/blog')
  })

  it('maps blog/[slug].ts to /blog/:slug', () => {
    expect(fileToRoutePath(`${PAGES}/blog/[slug].ts`, PAGES)).toBe('/blog/:slug')
  })

  it('maps [...all].ts to /:all*', () => {
    expect(fileToRoutePath(`${PAGES}/[...all].ts`, PAGES)).toBe('/:all*')
  })

  it('maps [...catchAll].ts to /:catchAll*', () => {
    expect(fileToRoutePath(`${PAGES}/[...catchAll].ts`, PAGES)).toBe('/:catchAll*')
  })

  it('strips route group prefix: (auth)/login.ts → /login', () => {
    expect(fileToRoutePath(`${PAGES}/(auth)/login.ts`, PAGES)).toBe('/login')
  })

  it('strips nested route group: (group)/sub/page.ts → /sub/page', () => {
    expect(fileToRoutePath(`${PAGES}/(group)/sub/page.ts`, PAGES)).toBe('/sub/page')
  })

  it('maps [id]/edit.ts → /:id/edit', () => {
    expect(fileToRoutePath(`${PAGES}/[id]/edit.ts`, PAGES)).toBe('/:id/edit')
  })

  it('maps users/[id]/posts/[postId].ts → /users/:id/posts/:postId', () => {
    expect(fileToRoutePath(`${PAGES}/users/[id]/posts/[postId].ts`, PAGES)).toBe(
      '/users/:id/posts/:postId',
    )
  })

  it('normalizes double slashes from route group at root', () => {
    expect(fileToRoutePath(`${PAGES}/(group)/index.ts`, PAGES)).toBe('/')
  })

  it('handles .js extension', () => {
    expect(fileToRoutePath(`${PAGES}/about.js`, PAGES)).toBe('/about')
  })

  it('handles deeply nested static route', () => {
    expect(fileToRoutePath(`${PAGES}/a/b/c.ts`, PAGES)).toBe('/a/b/c')
  })

  it('maps contact/index.ts to /contact (strips trailing index)', () => {
    expect(fileToRoutePath(`${PAGES}/contact/index.ts`, PAGES)).toBe('/contact')
  })
})

// ─── fileToTagName ───────────────────────────────────────────────────────────

describe('fileToTagName', () => {
  it('maps index.ts to page-index', () => {
    expect(fileToTagName(`${PAGES}/index.ts`, PAGES)).toBe('page-index')
  })

  it('maps about.ts to page-about', () => {
    expect(fileToTagName(`${PAGES}/about.ts`, PAGES)).toBe('page-about')
  })

  it('maps blog/[slug].ts to page-blog-slug', () => {
    expect(fileToTagName(`${PAGES}/blog/[slug].ts`, PAGES)).toBe('page-blog-slug')
  })

  it('maps [...all].ts to page-all (strips brackets and dots)', () => {
    expect(fileToTagName(`${PAGES}/[...all].ts`, PAGES)).toBe('page-all')
  })

  it('strips route group from tag name', () => {
    expect(fileToTagName(`${PAGES}/(auth)/login.ts`, PAGES)).toBe('page-login')
  })

  it('converts to lowercase', () => {
    expect(fileToTagName(`${PAGES}/MyPage.ts`, PAGES)).toBe('page-mypage')
  })

  it('maps blog/index.ts to page-blog (strips index when other segments exist)', () => {
    expect(fileToTagName(`${PAGES}/blog/index.ts`, PAGES)).toBe('page-blog')
  })

  it('maps items/index.ts to page-items', () => {
    expect(fileToTagName(`${PAGES}/items/index.ts`, PAGES)).toBe('page-items')
  })

  it('maps [id]/detail.ts to page-id-detail', () => {
    expect(fileToTagName(`${PAGES}/[id]/detail.ts`, PAGES)).toBe('page-id-detail')
  })
})

// ─── fileToLayoutTagName ─────────────────────────────────────────────────────

describe('fileToLayoutTagName', () => {
  it('maps default.ts to layout-default', () => {
    expect(fileToLayoutTagName(`${LAYOUTS}/default.ts`, LAYOUTS)).toBe('layout-default')
  })

  it('maps minimal.ts to layout-minimal', () => {
    expect(fileToLayoutTagName(`${LAYOUTS}/minimal.ts`, LAYOUTS)).toBe('layout-minimal')
  })

  it('maps blog/post.ts to layout-blog-post', () => {
    expect(fileToLayoutTagName(`${LAYOUTS}/blog/post.ts`, LAYOUTS)).toBe('layout-blog-post')
  })

  it('converts to lowercase', () => {
    expect(fileToLayoutTagName(`${LAYOUTS}/MyLayout.ts`, LAYOUTS)).toBe('layout-mylayout')
  })
})

// ─── fileToLayoutName ────────────────────────────────────────────────────────

describe('fileToLayoutName', () => {
  it('maps default.ts to default', () => {
    expect(fileToLayoutName(`${LAYOUTS}/default.ts`, LAYOUTS)).toBe('default')
  })

  it('maps minimal.ts to minimal', () => {
    expect(fileToLayoutName(`${LAYOUTS}/minimal.ts`, LAYOUTS)).toBe('minimal')
  })

  it('maps blog/post.ts to blog-post (slash → dash)', () => {
    expect(fileToLayoutName(`${LAYOUTS}/blog/post.ts`, LAYOUTS)).toBe('blog-post')
  })

  it('converts to lowercase', () => {
    expect(fileToLayoutName(`${LAYOUTS}/Admin.ts`, LAYOUTS)).toBe('admin')
  })
})

// ─── fileToImportAlias ───────────────────────────────────────────────────────

describe('fileToImportAlias', () => {
  it('creates _m_ prefixed alias by default', () => {
    expect(fileToImportAlias('/project/app/composables/useTheme.ts')).toBe('_m_useTheme')
  })

  it('uses custom prefix', () => {
    expect(fileToImportAlias('/project/store.ts', '_s')).toBe('_s_store')
  })

  it('replaces dashes with underscores', () => {
    expect(fileToImportAlias('/project/my-util.ts')).toBe('_m_my_util')
  })

  it('prepends underscore for filenames starting with a digit', () => {
    expect(fileToImportAlias('/project/01.store.ts')).toBe('_m__01_store')
  })

  it('replaces brackets in filename with underscores', () => {
    expect(fileToImportAlias('/project/[slug].ts')).toBe('_m__slug_')
  })
})

// ─── extractPluginOrder ──────────────────────────────────────────────────────

describe('extractPluginOrder', () => {
  it('returns numeric prefix for 01.store.ts', () => {
    expect(extractPluginOrder('01.store.ts')).toBe(1)
  })

  it('returns numeric prefix for 10.auth.ts', () => {
    expect(extractPluginOrder('10.auth.ts')).toBe(10)
  })

  it('returns Infinity for files without numeric prefix', () => {
    expect(extractPluginOrder('store.ts')).toBe(Infinity)
  })

  it('returns Infinity for files with a number but no trailing dot', () => {
    expect(extractPluginOrder('1store.ts')).toBe(Infinity)
  })

  it('works with absolute paths (extracts basename first)', () => {
    expect(extractPluginOrder('/project/app/plugins/01.store.ts')).toBe(1)
  })

  it('returns 0 for 00.first.ts', () => {
    expect(extractPluginOrder('00.first.ts')).toBe(0)
  })
})

// ─── sortPluginFiles ─────────────────────────────────────────────────────────

describe('sortPluginFiles', () => {
  it('sorts by numeric prefix ascending', () => {
    const files = ['/p/03.c.ts', '/p/01.a.ts', '/p/02.b.ts']
    expect(sortPluginFiles(files)).toEqual(['/p/01.a.ts', '/p/02.b.ts', '/p/03.c.ts'])
  })

  it('places numbered files before unnumbered files', () => {
    const files = ['/p/zzz.ts', '/p/01.first.ts']
    expect(sortPluginFiles(files)).toEqual(['/p/01.first.ts', '/p/zzz.ts'])
  })

  it('sorts unnumbered files alphabetically', () => {
    const files = ['/p/zoo.ts', '/p/alpha.ts', '/p/beta.ts']
    expect(sortPluginFiles(files)).toEqual(['/p/alpha.ts', '/p/beta.ts', '/p/zoo.ts'])
  })

  it('does not mutate the original array', () => {
    const files = ['/p/b.ts', '/p/a.ts']
    const copy = [...files]
    sortPluginFiles(files)
    expect(files).toEqual(copy)
  })

  it('returns empty array for empty input', () => {
    expect(sortPluginFiles([])).toEqual([])
  })

  it('handles single file', () => {
    expect(sortPluginFiles(['/p/store.ts'])).toEqual(['/p/store.ts'])
  })
})

// ─── isRouteDynamic ──────────────────────────────────────────────────────────

describe('isRouteDynamic', () => {
  it('returns true for routes with :param', () => {
    expect(isRouteDynamic('/blog/:slug')).toBe(true)
  })

  it('returns true for multiple params', () => {
    expect(isRouteDynamic('/users/:id/posts/:postId')).toBe(true)
  })

  it('returns false for static routes', () => {
    expect(isRouteDynamic('/about')).toBe(false)
  })

  it('returns false for root route', () => {
    expect(isRouteDynamic('/')).toBe(false)
  })

  it('returns false for catch-all routes', () => {
    expect(isRouteDynamic('/*')).toBe(false)
  })
})

// ─── isRouteCatchAll ─────────────────────────────────────────────────────────

describe('isRouteCatchAll', () => {
  it('returns true for /* catch-all', () => {
    expect(isRouteCatchAll('/*')).toBe(true)
  })

  it('returns false for static routes', () => {
    expect(isRouteCatchAll('/about')).toBe(false)
  })

  it('returns false for dynamic routes', () => {
    expect(isRouteCatchAll('/blog/:slug')).toBe(false)
  })

  it('returns false for root route', () => {
    expect(isRouteCatchAll('/')).toBe(false)
  })
})

// ─── sortRoutes ──────────────────────────────────────────────────────────────

describe('sortRoutes', () => {
  const makeRoute = (routePath: string) => ({
    filePath: `/pages${routePath}.ts`,
    routePath,
    tagName: `page${routePath.replace(/[/:*]/g, '-')}`,
    isDynamic: isRouteDynamic(routePath),
    isCatchAll: isRouteCatchAll(routePath),
  })

  it('places static routes before dynamic routes', () => {
    const routes = [makeRoute('/blog/:slug'), makeRoute('/about')]
    const sorted = sortRoutes(routes)
    expect(sorted[0].routePath).toBe('/about')
    expect(sorted[1].routePath).toBe('/blog/:slug')
  })

  it('places dynamic routes before catch-all routes', () => {
    const routes = [makeRoute('/*'), makeRoute('/blog/:slug')]
    const sorted = sortRoutes(routes)
    expect(sorted[0].routePath).toBe('/blog/:slug')
    expect(sorted[1].routePath).toBe('/*')
  })

  it('places static routes before catch-all routes', () => {
    const routes = [makeRoute('/*'), makeRoute('/about')]
    const sorted = sortRoutes(routes)
    expect(sorted[0].routePath).toBe('/about')
    expect(sorted[1].routePath).toBe('/*')
  })

  it('sorts static routes alphabetically', () => {
    const routes = [makeRoute('/zzz'), makeRoute('/aaa'), makeRoute('/mmm')]
    const sorted = sortRoutes(routes)
    expect(sorted.map((r) => r.routePath)).toEqual(['/aaa', '/mmm', '/zzz'])
  })

  it('does not mutate the original array', () => {
    const routes = [makeRoute('/about'), makeRoute('/')]
    const copy = [...routes]
    sortRoutes(routes)
    expect(routes).toEqual(copy)
  })

  it('handles all three tiers together', () => {
    const routes = [
      makeRoute('/*'),
      makeRoute('/blog/:slug'),
      makeRoute('/contact'),
      makeRoute('/about'),
      makeRoute('/:id'),
    ]
    const sorted = sortRoutes(routes)
    // Static first, alphabetically
    expect(sorted[0].routePath).toBe('/about')
    expect(sorted[1].routePath).toBe('/contact')
    // Dynamic next, alphabetically — ':' (58) < 'b' (98), so /:id before /blog/:slug
    expect(sorted[2].routePath).toBe('/:id')
    expect(sorted[3].routePath).toBe('/blog/:slug')
    // Catch-all last
    expect(sorted[4].routePath).toBe('/*')
  })

  it('returns empty array for empty input', () => {
    expect(sortRoutes([])).toEqual([])
  })
})

// ─── buildRouteEntry ─────────────────────────────────────────────────────────

describe('buildRouteEntry', () => {
  it('builds a complete RouteEntry for a static page', () => {
    const entry = buildRouteEntry(`${PAGES}/about.ts`, PAGES)
    expect(entry).toEqual({
      filePath: `${PAGES}/about.ts`,
      routePath: '/about',
      tagName: 'page-about',
      isDynamic: false,
      isCatchAll: false,
    })
  })

  it('builds a complete RouteEntry for a dynamic page', () => {
    const entry = buildRouteEntry(`${PAGES}/blog/[slug].ts`, PAGES)
    expect(entry).toEqual({
      filePath: `${PAGES}/blog/[slug].ts`,
      routePath: '/blog/:slug',
      tagName: 'page-blog-slug',
      isDynamic: true,
      isCatchAll: false,
    })
  })

  it('marks catch-all routes correctly (isCatchAll=true, isDynamic=true)', () => {
    const entry = buildRouteEntry(`${PAGES}/[...all].ts`, PAGES)
    expect(entry.routePath).toBe('/:all*')
    expect(entry.isCatchAll).toBe(true)
    expect(entry.isDynamic).toBe(true)
  })

  it('handles index page', () => {
    const entry = buildRouteEntry(`${PAGES}/index.ts`, PAGES)
    expect(entry.routePath).toBe('/')
    expect(entry.tagName).toBe('page-index')
    expect(entry.isDynamic).toBe(false)
    expect(entry.isCatchAll).toBe(false)
  })
})
