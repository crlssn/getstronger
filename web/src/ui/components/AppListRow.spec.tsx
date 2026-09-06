// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppList } from './AppList'
import { AppListRow } from './AppListRow'

const render = (row: React.ReactNode) => renderWithProviders(<AppList>{row}</AppList>)

describe('AppListRow', () => {
  test('reads as its title, and carries the rest of the row with it', () => {
    render(
      <AppListRow
        meta={<small>Weight × Reps · Back</small>}
        title="Bench press"
        trailing="80 kg × 5"
        to="/exercises/1"
      />,
    )

    const row = screen.getByRole('link', { name: /Bench press/ })
    expect(row).toHaveAttribute('href', '/exercises/1')
    expect(row).toHaveTextContent('Weight × Reps · Back')
    expect(row).toHaveTextContent('80 kg × 5')
  })

  // The same personal best was a link with a chevron on Progress and a link
  // without one on the profile tab, and only one of them looked tappable.
  test('shows a chevron for every row that navigates', () => {
    const { container } = render(<AppListRow title="Bench press" to="/exercises/1" />)

    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })

  test('draws no chevron on a row that goes nowhere', () => {
    const { container } = render(<AppListRow title="Bench press" />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.querySelectorAll('svg')).toHaveLength(0)
  })

  // Danger has to reach the element or the design system has a tone that does
  // nothing — the row that deletes a routine looked like the one above it.
  test('carries the danger tone', () => {
    render(<AppListRow title="Delete this routine" tone="danger" />)

    expect(screen.getByRole('listitem').className).toContain('danger')
  })

  test('is an ordinary row without one', () => {
    render(<AppListRow title="Bench press" />)

    expect(screen.getByRole('listitem').className).not.toContain('danger')
  })
})
