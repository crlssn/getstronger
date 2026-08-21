// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { useActionButton } from '@/stores/actionButton'
import { usePageTitleStore } from '@/stores/pageTitle'
import { renderWithProviders } from '@/ui/testing'
import { AppNavTop } from './AppNavTop'

const Icon = () => null

describe('AppNavTop', () => {
  beforeEach(() => {
    usePageTitleStore.setState({ pageTitle: 'Exercises' })
    useActionButton.setState({ action: () => {}, icon: undefined })
  })

  test('shows the title the route set', () => {
    renderWithProviders(<AppNavTop />, { route: '/exercises/1' })

    expect(screen.getByRole('heading', { name: 'Exercises' })).toBeInTheDocument()
  })

  // Back says where it goes, rather than only that it goes back.
  test.each([
    ['/exercises/1', 'Exercises'],
    ['/workouts/1', 'Workout'],
    ['/routines/1', 'Training'],
    ['/plans/1', 'Training'],
    ['/notifications', 'Me'],
    ['/users/1/followers', 'Home'],
  ])('names the tab %s was pushed onto', (route, label) => {
    renderWithProviders(<AppNavTop />, { route })

    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  })

  // A screen opened from a link or a bookmark has no history to go back
  // through, so back goes to the tab that owns it instead.
  test('falls back to the owning tab when there is no history', async () => {
    renderWithProviders(<AppNavTop />, { route: '/exercises/1' })

    await userEvent.click(screen.getByRole('button', { name: 'Exercises' }))

    expect(window.location.pathname).not.toBe('/exercises/1')
  })

  describe('the page action', () => {
    test('is absent until a screen supplies one', () => {
      renderWithProviders(<AppNavTop />, { route: '/exercises/1' })

      expect(screen.queryByRole('button', { name: 'Page action' })).not.toBeInTheDocument()
    })

    test('appears once a screen supplies one', () => {
      useActionButton.setState({ action: vi.fn(), icon: Icon })
      renderWithProviders(<AppNavTop />, { route: '/exercises/1' })

      expect(screen.getByRole('button', { name: 'Page action' })).toBeInTheDocument()
    })

    test('runs what the screen supplied', async () => {
      const action = vi.fn()
      useActionButton.setState({ action, icon: Icon })
      renderWithProviders(<AppNavTop />, { route: '/exercises/1' })

      await userEvent.click(screen.getByRole('button', { name: 'Page action' }))

      expect(action).toHaveBeenCalledOnce()
    })

    // Screens portal their own action into this node.
    test('leaves a slot for a screen to portal into', () => {
      renderWithProviders(<AppNavTop />, { route: '/exercises/1' })

      expect(document.getElementById('page-nav-action')).toBeInTheDocument()
    })
  })
})
