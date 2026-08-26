// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppValueChip } from './AppValueChip'

describe('AppValueChip', () => {
  test('reads the value, and is named by what the value belongs to', () => {
    renderWithProviders(
      <AppValueChip
        label="Rest between sets of Bench press: 1:30"
        value="1:30"
        onClick={vi.fn()}
      />,
    )

    const chip = screen.getByRole('button', { name: 'Rest between sets of Bench press: 1:30' })
    expect(chip).toHaveTextContent('1:30')
    expect(chip).toHaveAttribute('aria-expanded', 'false')
  })

  test('says when the control it opens is showing', async () => {
    const onClick = vi.fn()
    renderWithProviders(<AppValueChip label="Rest" value="1:30" expanded onClick={onClick} />)

    const chip = screen.getByRole('button', { name: 'Rest' })
    expect(chip).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(chip)
    expect(onClick).toHaveBeenCalled()
  })
})
