// @vitest-environment jsdom

import { act, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { useConfirmationStore } from '@/stores/confirmation'
import { useDashboardStore } from '@/stores/dashboard'
import { useNotificationStore } from '@/stores/notifications'
import { renderWithProviders } from '@/ui/testing'
import { App } from './App'

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(useDashboardStore.getState(), 'load').mockResolvedValue(undefined)
    useAuthStore.setState({ userId: '', accessToken: '' })
    useConfirmationStore.setState({ confirmation: null, resolver: null })
    useNotificationStore.setState({ unreadCount: 0 })
  })

  test('shows the guest shell to a signed-out visitor', () => {
    renderWithProviders(<App />, { route: '/login' })

    expect(screen.getByRole('link', { name: /GetStronger/ })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  test('shows the signed-in shell once there is a session', () => {
    useAuthStore.setState({ userId: 'user-me', accessToken: 'token' })

    renderWithProviders(<App />, { route: '/home' })

    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  // The confirm dialog, the offline banner and the update banner belong to the
  // app rather than to any screen, so they hang off the root either way.
  test('carries the app-level dialog into both shells', async () => {
    renderWithProviders(<App />, { route: '/login' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    act(() => {
      void useConfirmationStore
        .getState()
        .confirm({ title: 'Delete this?', confirmLabel: 'Delete' })
    })

    expect(await screen.findByRole('dialog')).toHaveTextContent('Delete this?')
  })
})
