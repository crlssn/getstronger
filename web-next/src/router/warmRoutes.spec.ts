// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const loaders = vi.hoisted(() => ({
  first: vi.fn(),
  second: vi.fn(),
}))

vi.mock('@/router/screens', () => ({
  screens: { first: loaders.first, second: loaders.second, landing: undefined },
}))

import { warmLazyRoutes, warmLazyRoutesWhenIdle } from './warmRoutes'

beforeEach(() => {
  loaders.first.mockReset().mockResolvedValue({ Component: () => null })
  loaders.second.mockReset().mockResolvedValue({ Component: () => null })
})

describe('warmLazyRoutes', () => {
  test('pulls down every screen', async () => {
    await warmLazyRoutes()

    expect(loaders.first).toHaveBeenCalledTimes(1)
    expect(loaders.second).toHaveBeenCalledTimes(1)
  })

  // A chunk that cannot be fetched now can still be fetched on demand, so a
  // failure here is not worth failing the app over.
  test('ignores a screen that will not load', async () => {
    loaders.first.mockRejectedValue(new Error('offline'))

    await expect(warmLazyRoutes()).resolves.toBeUndefined()
    expect(loaders.second).toHaveBeenCalled()
  })
})

describe('warmLazyRoutesWhenIdle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  test('waits for the browser to be idle when it can', () => {
    const requestIdleCallback = vi.fn()
    vi.stubGlobal('requestIdleCallback', requestIdleCallback)

    warmLazyRoutesWhenIdle()

    expect(requestIdleCallback).toHaveBeenCalledTimes(1)
  })

  test('falls back to a timer where idle callbacks do not exist', async () => {
    vi.useFakeTimers()
    // Deleted rather than stubbed: `in` is what the check uses, and stubGlobal
    // would leave the key in place.
    const original = Object.getOwnPropertyDescriptor(window, 'requestIdleCallback')
    Reflect.deleteProperty(window, 'requestIdleCallback')

    warmLazyRoutesWhenIdle()
    expect(loaders.first).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(loaders.first).toHaveBeenCalled()

    if (original) Object.defineProperty(window, 'requestIdleCallback', original)
  })
})
