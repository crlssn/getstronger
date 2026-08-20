// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useConnectionStore } from './connection'

describe('useConnectionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  test('starts from the browser connectivity state', () => {
    expect(useConnectionStore().online).toBe(navigator.onLine)
  })

  test('runs reconnect callbacks when connectivity returns', () => {
    const store = useConnectionStore()
    const callback = vi.fn()
    store.onReconnect(callback)

    store.setOnline(false)
    expect(callback).not.toHaveBeenCalled()

    store.setOnline(true)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  test('does not run reconnect callbacks while already online', () => {
    const store = useConnectionStore()
    const callback = vi.fn()
    store.onReconnect(callback)

    store.setOnline(true)
    expect(callback).not.toHaveBeenCalled()
  })

  test('follows browser online and offline events once started', () => {
    const store = useConnectionStore()
    store.start()

    window.dispatchEvent(new Event('offline'))
    expect(store.online).toBe(false)

    window.dispatchEvent(new Event('online'))
    expect(store.online).toBe(true)

    store.stop()
    window.dispatchEvent(new Event('offline'))
    expect(store.online).toBe(true)
  })
})
