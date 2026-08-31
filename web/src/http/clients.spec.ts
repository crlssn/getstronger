// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'

const { createConnectTransport, isNativePlatform } = vi.hoisted(() => ({
  createConnectTransport: vi.fn((_options: { interceptors: unknown[]; fetch: typeof fetch }) => ({
    transport: true,
  })),
  isNativePlatform: vi.fn(() => false),
}))

vi.mock('@connectrpc/connect-web', () => ({ createConnectTransport }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform } }))

/**
 * Builds the transport from a clean module registry.
 *
 * `clients.ts` creates it once at import time, so exercising the native branch
 * needs a fresh import. The interceptors are re-imported alongside it, because
 * resetting the registry gives them new identities and the copies held by a
 * previous import would no longer match.
 */
const loadTransport = async () => {
  vi.resetModules()
  createConnectTransport.mockClear()

  // clients.ts first: it sits in an import cycle (clients → interceptors →
  // jwt → requests → clients), so reading the interceptor bindings before that
  // graph has finished evaluating hands back undefined.
  await import('./clients')
  const { auth, logger, retryUnauthenticated } = await import('./interceptors')
  const { offlineCache } = await import('./offlineCache')
  const { nativeFetch } = await import('./native')

  const options = createConnectTransport.mock.calls[0]?.[0]
  if (!options) throw new Error('clients.ts did not create a transport')

  return {
    options,
    auth,
    logger,
    retryUnauthenticated,
    offlineCache,
    nativeFetch,
  }
}

describe('transport', () => {
  // Interceptors run outermost first, and this order is what makes the retry
  // work: `auth` last so it stamps the current token onto the replay as well
  // as the original, and `offlineCache` outermost so a stale read still serves
  // when even the token refresh cannot reach the network.
  test('orders the interceptors so a retry gets a fresh token', async () => {
    const t = await loadTransport()

    expect(t.options.interceptors).toEqual([
      t.offlineCache,
      t.logger,
      t.retryUnauthenticated,
      t.auth,
    ])
  })

  test('routes through CapacitorHttp on a native build', async () => {
    isNativePlatform.mockReturnValue(true)

    const t = await loadTransport()

    expect(t.options.fetch).toBe(t.nativeFetch)
  })

  // The refresh token is a cookie in the browser, so it only travels if the
  // request asks for credentials.
  test('sends credentials with browser requests', async () => {
    isNativePlatform.mockReturnValue(false)
    const underlying = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())

    const t = await loadTransport()
    expect(t.options.fetch).not.toBe(t.nativeFetch)
    await t.options.fetch('https://api.test/rpc', { method: 'POST' })

    expect(underlying).toHaveBeenCalledWith(
      'https://api.test/rpc',
      expect.objectContaining({ credentials: 'include' }),
    )
    underlying.mockRestore()
  })
})
