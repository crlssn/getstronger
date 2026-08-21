// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest'

import { currentPath, goTo, setNavigator } from './navigation'

const realLocation = Object.getOwnPropertyDescriptor(window, 'location')

/** jsdom's location methods are read-only, so the whole object is swapped. */
const stubLocation = (pathname = '/home') => {
  const replace = vi.fn()
  const assign = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname, replace, assign },
  })
  return { replace, assign }
}

afterEach(() => {
  setNavigator(undefined)
  if (realLocation) Object.defineProperty(window, 'location', realLocation)
  vi.restoreAllMocks()
})

describe('currentPath', () => {
  test('reads the path the browser is showing', () => {
    stubLocation('/exercises/1')

    expect(currentPath()).toBe('/exercises/1')
  })
})

describe('goTo', () => {
  test('uses the registered navigator', async () => {
    const navigate = vi.fn()
    setNavigator(navigate)

    await goTo('/login', { replace: true })

    expect(navigate).toHaveBeenCalledExactlyOnceWith('/login', { replace: true })
  })

  test('waits for an async navigator', async () => {
    const order: string[] = []
    setNavigator(async () => {
      await Promise.resolve()
      order.push('navigated')
    })

    await goTo('/login')
    order.push('returned')

    expect(order).toEqual(['navigated', 'returned'])
  })

  // A request fired before the router mounted can still need to redirect, and
  // dropping it would strand the user on a screen they are not entitled to.
  test('falls back to a document load before the router registers', async () => {
    const { replace, assign } = stubLocation()

    await goTo('/login', { replace: true })
    expect(replace).toHaveBeenCalledExactlyOnceWith('/login')
    expect(assign).not.toHaveBeenCalled()

    await goTo('/home')
    expect(assign).toHaveBeenCalledExactlyOnceWith('/home')
  })

  test('stops falling back once a navigator is registered', async () => {
    const { replace, assign } = stubLocation()
    const navigate = vi.fn()
    setNavigator(navigate)

    await goTo('/login', { replace: true })

    expect(navigate).toHaveBeenCalledOnce()
    expect(replace).not.toHaveBeenCalled()
    expect(assign).not.toHaveBeenCalled()
  })
})
