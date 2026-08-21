// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useConnectionStore } from './connection'

const store = () => useConnectionStore.getState()

describe('useConnectionStore', () => {
  beforeEach(() => {
    useConnectionStore.setState({ online: navigator.onLine, reconnectCallbacks: [] })
  })

  afterEach(() => {
    store().stop()
  })

  test('starts from the browser connectivity state', () => {
    expect(store().online).toBe(navigator.onLine)
  })

  test('runs reconnect callbacks when connectivity returns', () => {
    const callback = vi.fn()
    store().onReconnect(callback)

    store().setOnline(false)
    expect(callback).not.toHaveBeenCalled()

    store().setOnline(true)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  test('does not run reconnect callbacks while already online', () => {
    const callback = vi.fn()
    store().onReconnect(callback)

    store().setOnline(true)
    expect(callback).not.toHaveBeenCalled()
  })

  test('follows browser online and offline events once started', () => {
    store().start()

    window.dispatchEvent(new Event('offline'))
    expect(store().online).toBe(false)

    window.dispatchEvent(new Event('online'))
    expect(store().online).toBe(true)

    store().stop()
    window.dispatchEvent(new Event('offline'))
    expect(store().online).toBe(true)
  })
})
