// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { AppSearchField } from './AppSearchField'

describe('AppSearchField', () => {
  // The label is the placeholder and the accessible name at once: five screens
  // used to pass the same string to both by hand, and one of them drifted.
  test('names the field once for both the placeholder and the label', () => {
    render(<AppSearchField label="Search exercises" value="" onChange={vi.fn()} />)

    const input = screen.getByLabelText('Search exercises')
    expect(input).toHaveAttribute('placeholder', 'Search exercises')
    expect(input).toHaveAttribute('type', 'search')
  })

  test('reports what the user typed', async () => {
    const onChange = vi.fn()
    render(<AppSearchField label="Search" value="" onChange={onChange} />)

    await userEvent.type(screen.getByLabelText('Search'), 'squat')

    expect(onChange).toHaveBeenLastCalledWith('t')
  })

  test('renders a trailing control beside the field', () => {
    render(
      <AppSearchField
        label="Search"
        value=""
        onChange={vi.fn()}
        trailing={<button type="button">Close</button>}
      />,
    )

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  test('takes the larger size', () => {
    render(<AppSearchField label="Search" value="" onChange={vi.fn()} size="lg" />)

    expect(screen.getByLabelText('Search').className).toContain('lg')
  })
})
