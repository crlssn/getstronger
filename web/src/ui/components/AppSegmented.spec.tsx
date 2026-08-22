// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { AppSegmented } from './AppSegmented'

const options = [
  { label: 'Kilograms', value: 'kg' },
  { label: 'Pounds', value: 'lbs' },
]

describe('AppSegmented', () => {
  test('names the group it renders', () => {
    render(<AppSegmented label="Weight unit" options={options} value="kg" onChange={vi.fn()} />)

    expect(screen.getByRole('group', { name: 'Weight unit' })).toBeInTheDocument()
  })

  // aria-pressed, not just a class: the selected option has to be selected for
  // someone who cannot see which one is filled in.
  test('says which option is chosen', () => {
    render(<AppSegmented label="Weight unit" options={options} value="kg" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Kilograms' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Pounds' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('reports the option that was chosen', async () => {
    const onChange = vi.fn()
    render(<AppSegmented label="Weight unit" options={options} value="kg" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Pounds' }))

    expect(onChange).toHaveBeenCalledWith('lbs')
  })

  test('does not change while it is busy', async () => {
    const onChange = vi.fn()
    render(
      <AppSegmented label="Weight unit" options={options} value="kg" onChange={onChange} busy />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Pounds' }))

    expect(onChange).not.toHaveBeenCalled()
  })
})
