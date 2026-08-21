import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import AppListItemLink from './AppListItemLink'

describe('AppListItemLink', () => {
  test('renders a link to the given route, inside a list item', () => {
    render(
      <MemoryRouter>
        <ul>
          <AppListItemLink to="/users/42">Jane Doe</AppListItemLink>
        </ul>
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: 'Jane Doe' })
    expect(link).toHaveAttribute('href', '/users/42')
    expect(link.closest('li')).not.toBeNull()
  })
})
