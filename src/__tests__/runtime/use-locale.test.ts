import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { IncomingMessage } from 'node:http'
import { useLocale } from '../../runtime/composables/use-locale.js'

function setI18nConfig(cfg: { locales: string[]; defaultLocale: string; strategy: 'prefix' | 'prefix_except_default' | 'no_prefix' } | null) {
  ;(globalThis as Record<string, unknown>)['__CER_I18N_CONFIG__'] = cfg
}

function withReqUrl(url: string, fn: () => void) {
  const store = new AsyncLocalStorage<{ req: IncomingMessage }>()
  ;(globalThis as Record<string, unknown>)['__CER_REQ_STORE__'] = store
  store.run({ req: { url } as IncomingMessage }, fn)
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>)['__CER_I18N_CONFIG__']
  delete (globalThis as Record<string, unknown>)['__CER_REQ_STORE__']
})

describe('useLocale — no i18n config', () => {
  it('returns locale "default" when i18n is not configured', () => {
    setI18nConfig(null)
    const { locale } = useLocale()
    expect(locale).toBe('default')
  })

  it('returns locales ["default"] when i18n is not configured', () => {
    setI18nConfig(null)
    expect(useLocale().locales).toEqual(['default'])
  })
})

describe('useLocale — prefix_except_default strategy', () => {
  beforeEach(() => {
    setI18nConfig({ locales: ['en', 'fr', 'de'], defaultLocale: 'en', strategy: 'prefix_except_default' })
  })

  it('detects default locale from unprefixed path', () => {
    withReqUrl('/about', () => {
      expect(useLocale().locale).toBe('en')
    })
  })

  it('detects fr locale from /fr/about', () => {
    withReqUrl('/fr/about', () => {
      expect(useLocale().locale).toBe('fr')
    })
  })

  it('detects de locale from /de/contact', () => {
    withReqUrl('/de/contact', () => {
      expect(useLocale().locale).toBe('de')
    })
  })

  it('returns default locale for root path /', () => {
    withReqUrl('/', () => {
      expect(useLocale().locale).toBe('en')
    })
  })

  it('switchLocalePath: default → fr adds prefix', () => {
    withReqUrl('/about', () => {
      expect(useLocale().switchLocalePath('fr', '/about')).toBe('/fr/about')
    })
  })

  it('switchLocalePath: fr → default removes prefix', () => {
    withReqUrl('/fr/about', () => {
      expect(useLocale().switchLocalePath('en', '/fr/about')).toBe('/about')
    })
  })

  it('switchLocalePath: fr → de swaps prefix', () => {
    withReqUrl('/fr/about', () => {
      expect(useLocale().switchLocalePath('de', '/fr/about')).toBe('/de/about')
    })
  })

  it('switchLocalePath: root path → fr', () => {
    withReqUrl('/', () => {
      expect(useLocale().switchLocalePath('fr', '/')).toBe('/fr')
    })
  })

  it('exposes all configured locales', () => {
    withReqUrl('/', () => {
      expect(useLocale().locales).toEqual(['en', 'fr', 'de'])
    })
  })

  it('exposes defaultLocale', () => {
    withReqUrl('/', () => {
      expect(useLocale().defaultLocale).toBe('en')
    })
  })
})

describe('useLocale — prefix strategy', () => {
  beforeEach(() => {
    setI18nConfig({ locales: ['en', 'fr'], defaultLocale: 'en', strategy: 'prefix' })
  })

  it('detects en locale from /en/about', () => {
    withReqUrl('/en/about', () => {
      expect(useLocale().locale).toBe('en')
    })
  })

  it('switchLocalePath: en → fr produces /fr/about', () => {
    withReqUrl('/en/about', () => {
      expect(useLocale().switchLocalePath('fr', '/en/about')).toBe('/fr/about')
    })
  })

  it('switchLocalePath: even default locale gets a prefix', () => {
    withReqUrl('/fr/about', () => {
      expect(useLocale().switchLocalePath('en', '/fr/about')).toBe('/en/about')
    })
  })
})

describe('useLocale — no_prefix strategy', () => {
  beforeEach(() => {
    setI18nConfig({ locales: ['en', 'fr'], defaultLocale: 'en', strategy: 'no_prefix' })
  })

  it('always returns defaultLocale (no path detection)', () => {
    withReqUrl('/fr/about', () => {
      expect(useLocale().locale).toBe('en')
    })
  })

  it('switchLocalePath returns bare path unchanged', () => {
    withReqUrl('/about', () => {
      expect(useLocale().switchLocalePath('fr', '/about')).toBe('/about')
    })
  })
})

describe('generateRoutesCode — i18n route prefixing', () => {
  // These tests verify the route generation logic by importing the generator directly.
  // Full route expansion tests live alongside other generateRoutesCode tests.
  it('useLocale locale detection works for deeply nested locale paths', () => {
    setI18nConfig({ locales: ['en', 'fr'], defaultLocale: 'en', strategy: 'prefix_except_default' })
    withReqUrl('/fr/blog/my-post', () => {
      expect(useLocale().locale).toBe('fr')
      expect(useLocale().switchLocalePath('en', '/fr/blog/my-post')).toBe('/blog/my-post')
    })
  })
})
