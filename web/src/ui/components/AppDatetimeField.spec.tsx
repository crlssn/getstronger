// @vitest-environment jsdom

import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/ui/testing'

import { AppDatetimeField } from './AppDatetimeField'

describe('AppDatetimeField', () => {
  test('shows the moment in words, not the raw value', () => {
    renderWithProviders(
      <AppDatetimeField label="Started" model="2026-03-17T09:30" onUpdate={() => undefined} />,
    )

    expect(screen.getByText('Tue 17 Mar · 09:30')).toBeInTheDocument()
    expect(screen.getByLabelText('Started')).toHaveValue('2026-03-17T09:30')
  })

  test('commits when the field is left', () => {
    const onUpdate = vi.fn()
    renderWithProviders(
      <AppDatetimeField label="Started" model="2026-03-17T09:30" onUpdate={onUpdate} />,
    )

    const input = screen.getByLabelText('Started')
    fireEvent.change(input, { target: { value: '2026-03-18T10:00' } })
    expect(onUpdate).not.toHaveBeenCalled()

    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith('2026-03-18T10:00')
  })
})
