import posthog from 'posthog-js'
import { describe, expect, test } from 'vitest'

import { postHogOptions } from './posthog'

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
