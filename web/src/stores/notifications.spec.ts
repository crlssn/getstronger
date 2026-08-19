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
  },
}))

vi.mock('@/jwt/jwt', () => ({
  refreshAccessTokenOrLogout: vi.fn(),
}))

const getUnreadNotificationCount = vi.mocked(notificationClient.getUnreadNotificationCount)
const refreshAccessTokenOrLogout = vi.mocked(jwt.refreshAccessTokenOrLogout)

describe('notification store', () => {
  let hidden = false

  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    setActivePinia(createPinia())
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
  })

  test('loads a snapshot, pauses while hidden, and reloads when visible', async () => {
    const store = useNotificationStore()
    store.pollUnreadNotifications()

    await vi.waitFor(() => expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1))
    expect(store.unreadCount).toBe(2)

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))

    hidden = false
    getUnreadNotificationCount.mockResolvedValue({ count: 3n } as never)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2))
    expect(store.unreadCount).toBe(3)

    store.stopUnreadNotifications()
    expect(store.unreadCount).toBe(0)
  })

  test('polls every minute while visible but not while hidden', async () => {
    vi.useFakeTimers()
    const store = useNotificationStore()
    store.pollUnreadNotifications()
    await vi.advanceTimersByTimeAsync(0)

    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1)
    getUnreadNotificationCount.mockResolvedValue({ count: 3n } as never)

    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2)
    expect(store.unreadCount).toBe(3)

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2)

    store.stopUnreadNotifications()
  })

  test('refreshes the access token and retries once when the token expires', async () => {
    getUnreadNotificationCount
      .mockRejectedValueOnce(new ConnectError('token expired', Code.Unauthenticated))
      .mockResolvedValue({ count: 4n } as never)

    const store = useNotificationStore()
    store.pollUnreadNotifications()

    await vi.waitFor(() => expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2))
    expect(refreshAccessTokenOrLogout).toHaveBeenCalledTimes(1)
    expect(store.unreadCount).toBe(4)
    expect(useAuthStore().authorised).toBe(true)

    store.stopUnreadNotifications()
  })

  test('stops polling when the session cannot be refreshed', async () => {
    vi.useFakeTimers()
    refreshAccessTokenOrLogout.mockImplementation(async () => {
      useAuthStore().logout()
    })
    getUnreadNotificationCount.mockRejectedValue(
      new ConnectError('token expired', Code.Unauthenticated),
    )

    const store = useNotificationStore()
    store.pollUnreadNotifications()
    await vi.advanceTimersByTimeAsync(0)

    expect(refreshAccessTokenOrLogout).toHaveBeenCalledTimes(1)
    expect(store.unreadCount).toBe(0)

    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1)
  })
})
