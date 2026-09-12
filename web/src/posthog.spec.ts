import posthog from 'posthog-js'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { postHogOptions } from './posthog'

/**
 * Re-evaluates the module under the given env, with `init` stubbed so a
 * configured boot builds its options without ever reaching the network.
 */
const boot = async (env: Record<string, string>) => {
  const init = vi.spyOn(posthog, 'init').mockImplementation(() => posthog)
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  vi.resetModules()
  const module = await import('./posthog')
  return { init, ...module }
}

const configured = {
  MODE: 'production',
  VITE_POSTHOG_KEY: 'phc_test',
  VITE_POSTHOG_HOST: 'https://e.getstronger.studio',
}

let instances = 0

/**
 * Builds an event the way the app does, on the given URL, and hands back its
 * properties. `before_send` returns null, so nothing is queued or sent.
 */
const propertiesCapturedOn = (url: string): Record<string, unknown> => {
  window.history.replaceState({}, '', url)

  let properties: Record<string, unknown> = {}
  const client = posthog.init(
    'phc_spec',
    {
      ...postHogOptions,
      api_host: 'https://posthog.invalid',
      // Nothing here may reach the network: no remote config, no flags, no
      // externally loaded extension, and no event past before_send.
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
      disable_session_recording: true,
      autocapture: false,
      capture_pageview: false,
      persistence: 'memory',
      before_send: (event) => {
        properties = event?.properties ?? {}
        return null
      },
    },
    `spec-${(instances += 1)}`,
  )

  client?.capture('$pageview')
  return properties
}

const origin = window.location.origin

describe('posthog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  test('sends events to the configured host', async () => {
    const { init } = await boot(configured)

    expect(init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ api_host: 'https://e.getstronger.studio' }),
    )
  })

  // api_host is the reverse proxy on our own domain, which serves ingestion and
  // nothing else. Without ui_host the SDK assumes the two are the same host, and
  // every link it builds — toolbar, session replay — points at a 404.
  test('names the PostHog app as the host behind the proxy', async () => {
    const { init } = await boot(configured)

    expect(init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ ui_host: 'https://eu.posthog.com' }),
    )
  })

  test('stays quiet when the host is unset', async () => {
    const { init, isPostHogConfigured } = await boot({ ...configured, VITE_POSTHOG_HOST: '' })

    expect(init).not.toHaveBeenCalled()
    expect(isPostHogConfigured).toBe(false)
  })

  test('masks the recovery token a password reset link carries', () => {
    const properties = propertiesCapturedOn('/reset-password?token=a-real-reset-token')

    expect(properties.$current_url).not.toContain('a-real-reset-token')
    expect(properties.$current_url).toBe(`${origin}/reset-password?token=<masked>`)
  })

  test('masks the token an email verification link carries', () => {
    const properties = propertiesCapturedOn('/verify-email?token=a-real-verification-token')

    expect(properties.$current_url).not.toContain('a-real-verification-token')
    expect(properties.$current_url).toBe(`${origin}/verify-email?token=<masked>`)
  })

  test('leaves a query parameter that is not a credential alone', () => {
    const properties = propertiesCapturedOn('/exercises?search=squat')

    expect(properties.$current_url).toBe(`${origin}/exercises?search=squat`)
  })
})
