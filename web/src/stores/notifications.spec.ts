// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { notificationClient } from '@/http/clients'
import { useNotificationStore } from '@/stores/notifications'

vi.mock('@/http/clients', () => ({
  notificationClient: {
    unreadNotifications: vi.fn(),
  },
}))

vi.mock('@/http/unauthenticated', () => ({
  logoutUnauthenticatedUser: vi.fn(),
}))

const unreadNotifications = vi.mocked(notificationClient.unreadNotifications)

describe('notification store', () => {
  let hidden = false

  beforeEach(() => {
    setActivePinia(createPinia())
    unreadNotifications.mockReset()
    hidden = false
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    })

    unreadNotifications.mockImplementation((_request, options) => ({
      [Symbol.asyncIterator]() {
        return {
          next: () =>
            new Promise((_, reject) => {
              options?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              )
            }),
        }
      },
    }))
  })

  test('pauses while hidden and reconnects when visible', async () => {
    const store = useNotificationStore()
    store.streamUnreadNotifications()

    expect(unreadNotifications).toHaveBeenCalledTimes(1)
    const firstSignal = unreadNotifications.mock.calls[0]?.[1]?.signal
    expect(firstSignal?.aborted).toBe(false)

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(firstSignal?.aborted).toBe(true)

    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(unreadNotifications).toHaveBeenCalledTimes(2)

    const secondSignal = unreadNotifications.mock.calls[1]?.[1]?.signal
    store.stopUnreadNotifications()
    expect(secondSignal?.aborted).toBe(true)
  })
})
