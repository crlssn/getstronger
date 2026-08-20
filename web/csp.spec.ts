import { describe, expect, it } from 'vitest'

import { contentSecurityPolicy, injectContentSecurityPolicy } from './csp.ts'

const productionEnv = {
  VITE_API_URL: 'https://api.getstronger.studio',
  VITE_ENABLE_GOOGLE_ANALYTICS: 'true',
}

const localEnv = {
  VITE_API_URL: 'http://localhost:8080',
  VITE_ENABLE_GOOGLE_ANALYTICS: 'false',
}

const directives = (policy: string): Map<string, string> => {
  const map = new Map<string, string>()
  for (const directive of policy.split(';')) {
    const [name, ...values] = directive.trim().split(' ')
    map.set(name, values.join(' '))
  }
  return map
}

describe('contentSecurityPolicy', () => {
  it('restricts sources to the app origin by default', () => {
    const policy = directives(contentSecurityPolicy(productionEnv))
    expect(policy.get('default-src')).toBe("'self'")
    expect(policy.get('base-uri')).toBe("'self'")
    expect(policy.get('object-src')).toBe("'none'")
    expect(policy.get('form-action')).toBe("'self'")
  })

  it('allows connections to the configured API origin', () => {
    const policy = directives(contentSecurityPolicy(productionEnv))
    expect(policy.get('connect-src')).toContain('https://api.getstronger.studio')
  })

  it('reduces the API URL to its origin', () => {
    const policy = directives(
      contentSecurityPolicy({ ...localEnv, VITE_API_URL: 'http://localhost:8080/some/path' }),
    )
    expect(policy.get('connect-src')).toContain('http://localhost:8080')
    expect(policy.get('connect-src')).not.toContain('/some/path')
  })

  it('allows inline style attributes and data URI images the UI relies on', () => {
    const policy = directives(contentSecurityPolicy(localEnv))
    expect(policy.get('style-src')).toBe("'self' 'unsafe-inline'")
    expect(policy.get('img-src')).toContain('data:')
  })

  it('allows Google Analytics sources only when analytics is enabled', () => {
    const enabled = directives(contentSecurityPolicy(productionEnv))
    expect(enabled.get('script-src')).toContain('https://*.googletagmanager.com')
    expect(enabled.get('img-src')).toContain('https://*.google-analytics.com')
    expect(enabled.get('connect-src')).toContain('https://*.google-analytics.com')
    expect(enabled.get('connect-src')).toContain('https://*.analytics.google.com')

    const disabled = contentSecurityPolicy(localEnv)
    expect(disabled).not.toContain('googletagmanager')
    expect(disabled).not.toContain('google-analytics')
  })

  it('rejects a missing API URL instead of emitting a broken policy', () => {
    expect(() => contentSecurityPolicy({})).toThrow()
  })
})

describe('injectContentSecurityPolicy', () => {
  it('injects the policy as a meta tag during build', () => {
    const plugin = injectContentSecurityPolicy()
    expect(plugin.apply).toBe('build')

    const configResolved = plugin.configResolved as (config: unknown) => void
    configResolved({ env: productionEnv })

    const transform = plugin.transformIndexHtml as (html: string) => {
      html: string
      tags: { tag: string; attrs: Record<string, string>; injectTo: string }[]
    }
    const result = transform('<html><head></head><body></body></html>')
    expect(result.tags).toHaveLength(1)

    const [tag] = result.tags
    expect(tag.tag).toBe('meta')
    expect(tag.injectTo).toBe('head-prepend')
    expect(tag.attrs['http-equiv']).toBe('Content-Security-Policy')
    expect(tag.attrs.content).toBe(contentSecurityPolicy(productionEnv))
  })
})
