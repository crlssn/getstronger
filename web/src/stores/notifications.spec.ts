// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { Code, ConnectError } from '@connectrpc/connect'

import * as jwt from '@/jwt/jwt'
import { notificationClient } from '@/http/clients'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notifications'

vi.mock('@/http/clients', () => ({
  notificationClient: {
    getUnreadNotificationCount: vi.fn(),
    unreadNotifications: vi.fn(),
  },
}))

vi.mock('@/jwt/jwt', () => ({
  refreshAccessTokenOrLogout: vi.fn(),
}))

const unreadNotifications = vi.mocked(notificationClient.unreadNotifications)
const getUnreadNotificationCount = vi.mocked(notificationClient.getUnreadNotificationCount)
const refreshAccessTokenOrLogout = vi.mocked(jwt.refreshAccessTokenOrLogout)

describe('notification store', () => {
  let hidden = false

  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    unreadNotifications.mockReset()
    getUnreadNotificationCount.mockReset()
    refreshAccessTokenOrLogout.mockReset()
    refreshAccessTokenOrLogout.mockResolvedValue(undefined)
    getUnreadNotificationCount.mockResolvedValue({ count: 2n } as never)

    const authStore = useAuthStore()
    authStore.userId = 'user-1'
    authStore.accessToken = 'access-token'

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

  test('refreshes the access token and reconnects when the stream expires', async () => {
    vi.useFakeTimers()
    let attempts = 0
    unreadNotifications.mockImplementation((_request, options) => ({
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            attempts += 1
            if (attempts === 1) {
              return Promise.reject(new ConnectError('token expired', Code.Unauthenticated))
            }

            return new Promise((_, reject) => {
              options?.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              )
            })
          },
        }
      },
    }))

    const store = useNotificationStore()
    store.streamUnreadNotifications()
    await vi.advanceTimersByTimeAsync(0)

    expect(unreadNotifications).toHaveBeenCalledTimes(1)
    expect(refreshAccessTokenOrLogout).toHaveBeenCalledTimes(1)

    // The session survived, so the retry loop reconnects instead of logging out.
    await vi.advanceTimersByTimeAsync(5000)
    expect(unreadNotifications).toHaveBeenCalledTimes(2)
    expect(useAuthStore().authorised).toBe(true)

    store.stopUnreadNotifications()
  })

  test('stops streaming when the session cannot be refreshed', async () => {
    vi.useFakeTimers()
    refreshAccessTokenOrLogout.mockImplementation(async () => {
      useAuthStore().logout()
    })
    unreadNotifications.mockImplementation(() => ({
      [Symbol.asyncIterator]() {
        return {
          next: () => Promise.reject(new ConnectError('token expired', Code.Unauthenticated)),
        }
      },
    }))

    const store = useNotificationStore()
    store.streamUnreadNotifications()
    await vi.advanceTimersByTimeAsync(0)

    expect(refreshAccessTokenOrLogout).toHaveBeenCalledTimes(1)
    expect(store.unreadCount).toBe(0)

    await vi.advanceTimersByTimeAsync(5000)
    expect(unreadNotifications).toHaveBeenCalledTimes(1)
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
