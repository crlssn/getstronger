import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import AppListItem from './AppListItem'

describe('AppListItem', () => {
  test('renders a plain list item by default', () => {
    render(<AppListItem>Bench press</AppListItem>)

    const item = screen.getByText('Bench press')
    expect(item.tagName).toBe('LI')
    expect(item).toHaveClass('text-text')
  })

  test('renders the danger variant in the danger colour', () => {
    render(<AppListItem is="danger">Delete account</AppListItem>)

    expect(screen.getByText('Delete account')).toHaveClass('text-danger')
  })

  test('renders the header variant as a section label', () => {
    render(<AppListItem is="header">This week</AppListItem>)

    expect(screen.getByText('This week')).toHaveClass('text-text-muted', 'font-semibold')
  })
})
