// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'

import { useNavTabs } from '@/stores/navTabs'
import { renderWithProviders } from '@/ui/testing'
import { AppNavTabs } from './AppNavTabs'

const tabs = [
  { name: 'Workouts', href: '/users/1' },
  { name: 'Followers', href: '/users/1/followers' },
]

describe('AppNavTabs', () => {
  beforeEach(() => {
    useNavTabs.setState({ tabs: [] })
  })

  // A screen that sets no tabs must not leave an empty bar behind.
  test('renders nothing when the screen supplied no tabs', () => {
    renderWithProviders(<AppNavTabs />, { route: '/users/1' })

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  test('renders the tabs the screen supplied', () => {
    useNavTabs.setState({ tabs })
    renderWithProviders(<AppNavTabs />, { route: '/users/1' })

    expect(screen.getByRole('link', { name: 'Workouts' })).toHaveAttribute('href', '/users/1')
    expect(screen.getByRole('link', { name: 'Followers' })).toHaveAttribute(
      'href',
      '/users/1/followers',
    )
  })

  test('marks the tab for the current screen', () => {
    useNavTabs.setState({ tabs })
    renderWithProviders(<AppNavTabs />, { route: '/users/1/followers' })

    expect(screen.getByRole('link', { name: 'Followers' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Workouts' })).not.toHaveAttribute('aria-current')
  })

  // The tabs a profile carries differ by query, so the comparison includes it.
  test('tells apart two tabs that differ only by query', () => {
    useNavTabs.setState({
      tabs: [
        { name: 'Recent', href: '/progress?range=month' },
        { name: 'All time', href: '/progress?range=year' },
      ],
    })
    renderWithProviders(<AppNavTabs />, { route: '/progress?range=year' })

    expect(screen.getByRole('link', { name: 'All time' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Recent' })).not.toHaveAttribute('aria-current')
  })
})
