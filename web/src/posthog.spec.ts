import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const init = vi.fn()

vi.mock('posthog-js', () => ({
  default: { identify: vi.fn(), init, reset: vi.fn() },
}))

// The module decides at import time, so each case needs its own import.
const load = async (env: Record<string, unknown>) => {
  vi.resetModules()
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value as string)
  return import('./posthog')
}

const configured = {
  VITE_POSTHOG_KEY: 'phc_token',
  VITE_POSTHOG_HOST: 'https://posthog.example',
}

describe('posthog', () => {
  beforeEach(() => init.mockReset())

  afterEach(() => vi.unstubAllEnvs())

  test('captures events from a configured production build', async () => {
    const { isPostHogConfigured } = await load({ ...configured, PROD: true })

    expect(isPostHogConfigured).toBe(true)
    expect(init).toHaveBeenCalledWith('phc_token', expect.objectContaining({}))
  })

  // Analytics belong to production. A development server must never reach
  // PostHog, whatever a local web/.env happens to hold.
  test('stays out of the way in development, however it is configured', async () => {
    const { isPostHogConfigured } = await load({ ...configured, PROD: false })

    expect(isPostHogConfigured).toBe(false)
    expect(init).not.toHaveBeenCalled()
  })

  test('needs a key and a host even in production', async () => {
    const { isPostHogConfigured } = await load({
      PROD: true,
      VITE_POSTHOG_HOST: '',
      VITE_POSTHOG_KEY: '',
    })

    expect(isPostHogConfigured).toBe(false)
    expect(init).not.toHaveBeenCalled()
  })
})
