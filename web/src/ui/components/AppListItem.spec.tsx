// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppListItem, AppListItemLink } from './AppListItem'

describe('AppListItem', () => {
  test('renders a list row', () => {
    renderWithProviders(
      <ul>
        <AppListItem>{'Bench press'}</AppListItem>
      </ul>,
    )

    expect(screen.getByRole('listitem')).toHaveTextContent('Bench press')
  })

  // Destructive rows read as danger, section labels read as headers; the
  // design system has no third option.
  test.each(['danger', 'header'] as const)('carries the %s role', (role) => {
    renderWithProviders(
      <ul>
        <AppListItem is={role}>{'Delete'}</AppListItem>
      </ul>,
    )

    expect(screen.getByRole('listitem').className).toContain(role)
  })

  test('is a plain row when given no role', () => {
    renderWithProviders(
      <ul>
        <AppListItem>{'Bench press'}</AppListItem>
      </ul>,
    )

    const item = screen.getByRole('listitem')
    expect(item.className).not.toContain('danger')
    expect(item.className).not.toContain('header')
  })
})

describe('AppListItemLink', () => {
  test('renders a row that navigates', () => {
    renderWithProviders(
      <ul>
        <AppListItemLink to="/exercises/1">{'Bench press'}</AppListItemLink>
      </ul>,
    )

    expect(screen.getByRole('link', { name: 'Bench press' })).toHaveAttribute(
      'href',
      '/exercises/1',
    )
  })

  // The link fills the row rather than sitting inside it, so the whole row is
  // the tap target.
  test('puts the link inside the row', () => {
    renderWithProviders(
      <ul>
        <AppListItemLink to="/exercises/1">{'Bench press'}</AppListItemLink>
      </ul>,
    )

    expect(screen.getByRole('listitem')).toContainElement(screen.getByRole('link'))
  })
})
