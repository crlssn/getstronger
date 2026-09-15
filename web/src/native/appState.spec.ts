import { describe, expect, test, vi } from 'vitest'

import { appStateChanged, subscribeAppState } from './appState'

describe('subscribeAppState', () => {
  test('hands every change to each subscriber until it unsubscribes', () => {
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = subscribeAppState(first)
    const stopSecond = subscribeAppState(second)

    appStateChanged(false)
    expect(first).toHaveBeenCalledWith(false)
    expect(second).toHaveBeenCalledWith(false)

    stopFirst()
    appStateChanged(true)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenLastCalledWith(true)

    stopSecond()
  })
})
