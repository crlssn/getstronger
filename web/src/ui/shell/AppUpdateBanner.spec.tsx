// @vitest-environment jsdom

import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { useAppVersionStore } from '@/stores/appVersion'
import { useBottomChrome } from '@/stores/bottomChrome'
import { renderWithProviders } from '@/ui/testing'
import { AppUpdateBanner } from './AppUpdateBanner'

describe('AppUpdateBanner', () => {
  beforeEach(() => {
    useAppVersionStore.setState({
      runningVersion: 'abc123',
      updateAvailable: false,
      dismissedVersion: '',
    })
    useBottomChrome.setState({ pinned: {} })
  })

  // The same hard-coded tab-bar height the offline banner cleared: on the
  // workout session there is no tab bar under it to clear.
  test('floats above whatever is pinned to the bottom', () => {
    useBottomChrome.setState({ pinned: { 'tab-bar': 92 } })
    useAppVersionStore.setState({ updateAvailable: true })

    renderWithProviders(<AppUpdateBanner />)

    expect(screen.getByRole('status').style.getPropertyValue('--bottom-chrome')).toBe('92px')
  })

  test('says nothing while the running build is current', () => {
    renderWithProviders(<AppUpdateBanner />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('offers the update once a deploy lands', () => {
    useAppVersionStore.setState({ updateAvailable: true })
    renderWithProviders(<AppUpdateBanner />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  // Prompting rather than reloading: a reload mid-set would interrupt a
  // workout the user is in the middle of logging.
  test('reloads only when asked', async () => {
    const refresh = vi.fn()
    useAppVersionStore.setState({ updateAvailable: true, refresh })
    renderWithProviders(<AppUpdateBanner />)

    expect(refresh).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(refresh).toHaveBeenCalledOnce()
  })

  test('can be dismissed', async () => {
    const dismiss = vi.fn().mockResolvedValue(undefined)
    useAppVersionStore.setState({ updateAvailable: true, dismiss })
    renderWithProviders(<AppUpdateBanner />)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(dismiss).toHaveBeenCalledOnce()
  })

  test('goes away once the store says the update is handled', () => {
    useAppVersionStore.setState({ updateAvailable: true })
    renderWithProviders(<AppUpdateBanner />)

    act(() => useAppVersionStore.setState({ updateAvailable: false }))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  test('stops polling once it is gone', () => {
    const stop = vi.fn()
    useAppVersionStore.setState({ stop })
    const { unmount } = renderWithProviders(<AppUpdateBanner />)

    unmount()

    expect(stop).toHaveBeenCalledOnce()
  })
})
