// @vitest-environment jsdom

import { act, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

// Partial: clients.ts builds its transport from the real `offlineCache`
// interceptor in this same module, so replacing the whole thing breaks it.
vi.mock('@/http/offlineCache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/http/offlineCache')>()),
  clearOfflineCache: vi.fn(),
}))

import { clearOfflineCache } from '@/http/offlineCache'
import { useAuthStore } from '@/stores/auth'
import { useConnectionStore } from '@/stores/connection'
import { useMutationQueueStore } from '@/stores/mutationQueue'
import { renderWithProviders } from '@/ui/testing'
import { AppOfflineBanner } from './AppOfflineBanner'

const clearCache = vi.mocked(clearOfflineCache)

const queued = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    method: 'api.v1.WorkoutService.CreateWorkout',
    request: '{}',
    queuedAt: `2026-08-14T12:0${index}:00Z`,
  }))

describe('AppOfflineBanner', () => {
  beforeEach(() => {
    clearCache.mockReset()
    useConnectionStore.setState({ online: true, reconnectCallbacks: [] })
    useMutationQueueStore.setState({ pending: [] })
    useAuthStore.setState({ userId: 'user-1', accessToken: 'token' })
  })

  afterEach(() => {
    useConnectionStore.getState().stop()
  })

  test('says nothing while the app can reach the backend', () => {
    renderWithProviders(<AppOfflineBanner />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('says the app is showing saved data once it cannot', () => {
    renderWithProviders(<AppOfflineBanner />)

    act(() => useConnectionStore.getState().setOnline(false))

    expect(screen.getByRole('status')).toHaveTextContent('offline')
  })

  test('counts the changes waiting to sync', () => {
    useMutationQueueStore.setState({ pending: queued(2) })
    useConnectionStore.setState({ online: false, reconnectCallbacks: [] })
    renderWithProviders(<AppOfflineBanner />)

    expect(screen.getByRole('status')).toHaveTextContent('2 changes will sync')
  })

  test('counts a single change in the singular', () => {
    useMutationQueueStore.setState({ pending: queued(1) })
    useConnectionStore.setState({ online: false, reconnectCallbacks: [] })
    renderWithProviders(<AppOfflineBanner />)

    expect(screen.getByRole('status')).toHaveTextContent('1 change will sync')
  })

  test('mentions no changes when none are waiting', () => {
    useConnectionStore.setState({ online: false, reconnectCallbacks: [] })
    renderWithProviders(<AppOfflineBanner />)

    expect(screen.getByRole('status')).not.toHaveTextContent('will sync')
  })

  // Cached responses belong to the account that fetched them, and a queued
  // change must never be replayed into whichever account signs in next.
  test('sweeps the offline state away on logout', () => {
    useMutationQueueStore.setState({ pending: queued(1) })
    renderWithProviders(<AppOfflineBanner />)

    act(() => useAuthStore.getState().logout())

    expect(clearCache).toHaveBeenCalledOnce()
    expect(useMutationQueueStore.getState().pending).toHaveLength(0)
  })

  test('leaves the offline state alone when a signed-out visitor arrives', () => {
    useAuthStore.setState({ userId: '', accessToken: '' })
    renderWithProviders(<AppOfflineBanner />)

    act(() => useAuthStore.getState().logout())

    expect(clearCache).not.toHaveBeenCalled()
  })

  test('stops following connectivity once it is gone', () => {
    const { unmount } = renderWithProviders(<AppOfflineBanner />)

    unmount()
    window.dispatchEvent(new Event('offline'))

    expect(useConnectionStore.getState().online).toBe(true)
  })
})
