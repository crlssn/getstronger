// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { Code, ConnectError } from '@connectrpc/connect'

import { notificationClient } from '@/http/clients'
import { useNotificationStore } from '@/stores/notifications'

vi.mock('@/http/clients', () => ({
  notificationClient: {
    getUnreadNotificationCount: vi.fn(),
    unreadNotifications: vi.fn(),
  },
}))

vi.mock('@/http/unauthenticated', () => ({
  logoutUnauthenticatedUser: vi.fn(),
}))

const unreadNotifications = vi.mocked(notificationClient.unreadNotifications)
const getUnreadNotificationCount = vi.mocked(notificationClient.getUnreadNotificationCount)

describe('notification store', () => {
  let hidden = false

  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    unreadNotifications.mockReset()
    getUnreadNotificationCount.mockReset()
    getUnreadNotificationCount.mockResolvedValue({ count: 2n } as never)
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

  test('loads a snapshot, pauses while hidden, and reloads when visible', async () => {
    const store = useNotificationStore()
    store.streamUnreadNotifications()

    await vi.waitFor(() => expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(unreadNotifications).toHaveBeenCalledTimes(1))
    expect(store.unreadCount).toBe(2)
    const firstSignal = unreadNotifications.mock.calls[0]?.[1]?.signal
    expect(firstSignal?.aborted).toBe(false)

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(firstSignal?.aborted).toBe(true)

    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(unreadNotifications).toHaveBeenCalledTimes(2))

    const secondSignal = unreadNotifications.mock.calls[1]?.[1]?.signal
    store.stopUnreadNotifications()
    expect(secondSignal?.aborted).toBe(true)
  })

  test('starts the stream when an older backend does not expose the snapshot endpoint', async () => {
    getUnreadNotificationCount.mockRejectedValue(
      new ConnectError('not implemented', Code.Unimplemented),
    )

    const store = useNotificationStore()
    store.streamUnreadNotifications()

    await vi.waitFor(() => expect(unreadNotifications).toHaveBeenCalledTimes(1))
    store.stopUnreadNotifications()
  })

  test('reconciles the unread count every ten minutes while visible', async () => {
    vi.useFakeTimers()
    const store = useNotificationStore()
    store.streamUnreadNotifications()
    await vi.advanceTimersByTimeAsync(0)

    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1)
    getUnreadNotificationCount.mockResolvedValue({ count: 3n } as never)

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2)
    expect(store.unreadCount).toBe(3)

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2)
  })
})
