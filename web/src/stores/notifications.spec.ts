// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Code, ConnectError } from '@connectrpc/connect'

vi.mock('@/http/clients', () => ({
  notificationClient: { getUnreadNotificationCount: vi.fn() },
}))

vi.mock('@/jwt/jwt', () => ({ refreshAccessTokenOrLogout: vi.fn() }))

import { notificationClient } from '@/http/clients'
import * as jwt from '@/jwt/jwt'
import { appStateChanged } from '@/native/appState'
import { selectAuthorised, useAuthStore } from '@/stores/auth'
import { useNotificationStore } from './notifications'

const getUnreadNotificationCount = vi.mocked(notificationClient.getUnreadNotificationCount)
const refreshAccessTokenOrLogout = vi.mocked(jwt.refreshAccessTokenOrLogout)

const store = () => useNotificationStore.getState()

describe('notification store', () => {
  let hidden = false

  beforeEach(() => {
    getUnreadNotificationCount.mockReset()
    refreshAccessTokenOrLogout.mockReset()
    refreshAccessTokenOrLogout.mockResolvedValue(undefined)
    getUnreadNotificationCount.mockResolvedValue({ count: 2n } as never)

    useNotificationStore.setState({ unreadCount: 0 })
    useAuthStore.setState({ userId: 'user-1', accessToken: 'access-token' })

    hidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  })

  afterEach(() => {
    store().stopUnreadNotifications()
    vi.useRealTimers()
  })

  test('loads a snapshot, pauses while hidden, and reloads when visible', async () => {
    store().pollUnreadNotifications()

    await vi.waitFor(() => expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1))
    expect(store().unreadCount).toBe(2)

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))

    hidden = false
    getUnreadNotificationCount.mockResolvedValue({ count: 3n } as never)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2))
    expect(store().unreadCount).toBe(3)

    store().stopUnreadNotifications()
    expect(store().unreadCount).toBe(0)
  })

  test('polls every minute while visible but not while hidden', async () => {
    vi.useFakeTimers()
    store().pollUnreadNotifications()
    await vi.advanceTimersByTimeAsync(0)

    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1)
    getUnreadNotificationCount.mockResolvedValue({ count: 3n } as never)

    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2)
    expect(store().unreadCount).toBe(3)

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2)
  })

  test('refreshes the access token and retries once when the token expires', async () => {
    getUnreadNotificationCount
      .mockRejectedValueOnce(new ConnectError('token expired', Code.Unauthenticated))
      .mockResolvedValue({ count: 4n } as never)

    store().pollUnreadNotifications()

    await vi.waitFor(() => expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2))
    expect(refreshAccessTokenOrLogout).toHaveBeenCalledTimes(1)
    expect(store().unreadCount).toBe(4)
    expect(selectAuthorised(useAuthStore.getState())).toBe(true)
  })

  test('stops polling when the session cannot be refreshed', async () => {
    vi.useFakeTimers()
    refreshAccessTokenOrLogout.mockImplementation(async () => {
      useAuthStore.getState().logout()
    })
    getUnreadNotificationCount.mockRejectedValue(
      new ConnectError('token expired', Code.Unauthenticated),
    )

    store().pollUnreadNotifications()
    await vi.advanceTimersByTimeAsync(0)

    expect(refreshAccessTokenOrLogout).toHaveBeenCalledTimes(1)
    expect(store().unreadCount).toBe(0)

    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1)
  })

  // Importing this store used to add the visibility listener, so it fired for
  // signed-out visitors and outlived stopUnreadNotifications.
  test('does not watch visibility until polling starts', async () => {
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()

    expect(getUnreadNotificationCount).not.toHaveBeenCalled()
  })

  test('stops watching visibility once polling stops', async () => {
    store().pollUnreadNotifications()
    await vi.waitFor(() => expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1))

    store().stopUnreadNotifications()
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()

    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1)
  })

  // Inside the native shell the badge was only as fresh as the last poll before
  // the app was suspended, so the OS's own foreground signal refreshes it at
  // once and restarts the poll from that moment rather than adding a second.
  test('refreshes at once when the native app returns to the foreground', async () => {
    vi.useFakeTimers()
    store().pollUnreadNotifications()
    await vi.advanceTimersByTimeAsync(0)
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30 * 1000)
    getUnreadNotificationCount.mockResolvedValue({ count: 5n } as never)
    appStateChanged(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(2)
    expect(store().unreadCount).toBe(5)

    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(3)
  })

  test('does not refresh for the app going to the background', async () => {
    vi.useFakeTimers()
    store().pollUnreadNotifications()
    await vi.advanceTimersByTimeAsync(0)

    appStateChanged(false)
    await vi.advanceTimersByTimeAsync(0)

    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1)
  })

  test('hears the foreground only while polling', async () => {
    appStateChanged(true)
    await Promise.resolve()
    expect(getUnreadNotificationCount).not.toHaveBeenCalled()

    store().pollUnreadNotifications()
    await vi.waitFor(() => expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1))
    store().stopUnreadNotifications()

    appStateChanged(true)
    await Promise.resolve()
    expect(getUnreadNotificationCount).toHaveBeenCalledTimes(1)
  })
})
