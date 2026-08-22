// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppPasswordInput } from './AppPasswordInput'

describe('AppPasswordInput', () => {
  test('hides what is typed', () => {
    renderWithProviders(<AppPasswordInput label="Password" value="" onValueChange={vi.fn()} />)

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  test('reveals it when asked, and hides it again', async () => {
    renderWithProviders(
      <AppPasswordInput label="Password" value="hunter2" onValueChange={vi.fn()} />,
    )

    const toggle = screen.getByRole('button')
    await userEvent.click(toggle)
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')

    await userEvent.click(toggle)
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  test('reports what the user types', async () => {
    const onValueChange = vi.fn()
    renderWithProviders(
      <AppPasswordInput label="Password" value="" onValueChange={onValueChange} />,
    )

    await userEvent.type(screen.getByLabelText('Password'), 'a')

    expect(onValueChange).toHaveBeenCalledWith('a')
  })
})
