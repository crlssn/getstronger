import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ init: vi.fn(), identify: vi.fn(), reset: vi.fn() }))

vi.mock('posthog-js', () => ({ default: sdk }))

const boot = async (env: Record<string, string>) => {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  vi.resetModules()
  return import('./posthog')
}

const configured = {
  MODE: 'production',
  VITE_POSTHOG_KEY: 'phc_test',
  VITE_POSTHOG_HOST: 'https://e.getstronger.studio',
}

describe('posthog', () => {
  beforeEach(() => {
    sdk.init.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test('sends events to the configured host', async () => {
    await boot(configured)

    expect(sdk.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ api_host: 'https://e.getstronger.studio' }),
    )
  })

  // api_host is the reverse proxy on our own domain, which serves ingestion and
  // nothing else. Without ui_host the SDK assumes the two are the same host, and
  // every link it builds — toolbar, session replay — points at a 404.
  test('names the PostHog app as the host behind the proxy', async () => {
    await boot(configured)

    expect(sdk.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ ui_host: 'https://eu.posthog.com' }),
    )
  })

  test('stays quiet when the host is unset', async () => {
    const { isPostHogConfigured } = await boot({ ...configured, VITE_POSTHOG_HOST: '' })

    expect(sdk.init).not.toHaveBeenCalled()
    expect(isPostHogConfigured).toBe(false)
  })
})
