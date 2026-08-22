// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'

import { AppNumberField } from './AppNumberField'

/** The field is controlled, so a spec needs something holding its value. */
const Harness = ({ initial }: { initial?: number }) => {
  const [value, setValue] = useState<number | undefined>(initial)
  return <AppNumberField aria-label="Weight" value={value} onChange={setValue} />
}

describe('AppNumberField', () => {
  test('shows the number it is given', () => {
    render(<AppNumberField aria-label="Weight" value={60} onChange={vi.fn()} />)

    expect(screen.getByLabelText('Weight')).toHaveValue('60')
  })

  test('reports the number that was typed', async () => {
    const onChange = vi.fn()
    render(<AppNumberField aria-label="Weight" value={undefined} onChange={onChange} />)

    await userEvent.type(screen.getByLabelText('Weight'), '6')

    expect(onChange).toHaveBeenCalledWith(6)
  })

  // "3." parses to 3, which written back as text would eat the point and with
  // it every decimal the user tried to type.
  test('keeps a half-typed decimal on screen', async () => {
    render(<Harness />)

    const field = screen.getByLabelText('Weight')
    await userEvent.type(field, '3.5')

    expect(field).toHaveValue('3.5')
  })

  test('clears to nothing rather than to zero', async () => {
    const onChange = vi.fn()
    render(<AppNumberField aria-label="Weight" value={60} onChange={onChange} />)

    await userEvent.clear(screen.getByLabelText('Weight'))

    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  test('takes a value written from outside', () => {
    const { rerender } = render(
      <AppNumberField aria-label="Weight" value={undefined} onChange={vi.fn()} />,
    )

    rerender(<AppNumberField aria-label="Weight" value={80} onChange={vi.fn()} />)

    expect(screen.getByLabelText('Weight')).toHaveValue('80')
  })

  test('shows a unit beside what is typed', () => {
    render(<AppNumberField aria-label="Weight" unit="kg" value={60} onChange={vi.fn()} />)

    expect(screen.getByText('kg')).toBeInTheDocument()
  })
})
