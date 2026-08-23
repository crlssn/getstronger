// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppDurationStepper } from './AppDurationStepper'

const Harness = ({ value: initial = 90, ...rest }: { value?: number; max?: number }) => {
  const [value, setValue] = useState(initial)
  return (
    <AppDurationStepper label="Rest between sets" value={value} onChange={setValue} {...rest} />
  )
}

const field = () => screen.getByRole('textbox', { name: 'Rest between sets' })
const minus = () => screen.getByRole('button', { name: /Subtract 30 seconds/ })
const plus = () => screen.getByRole('button', { name: /Add 30 seconds/ })

describe('AppDurationStepper', () => {
  test('reads the duration off a clock rather than as a second count', () => {
    renderWithProviders(<Harness value={90} />)

    expect(field()).toHaveValue('1:30')
  })

  test('nudges the duration by a step in each direction', async () => {
    renderWithProviders(<Harness value={90} />)

    await userEvent.click(plus())
    expect(field()).toHaveValue('2:00')

    await userEvent.click(minus())
    await userEvent.click(minus())
    expect(field()).toHaveValue('1:00')
  })

  // The buttons name the field they belong to: a card holding several of them
  // would otherwise offer a screen reader four identical "Add 30 seconds".
  test('names each button after the field it adjusts', () => {
    renderWithProviders(<Harness />)

    expect(plus()).toHaveAccessibleName('Add 30 seconds to Rest between sets')
    expect(minus()).toHaveAccessibleName('Subtract 30 seconds from Rest between sets')
  })

  test('stops at zero rather than stepping past it', async () => {
    renderWithProviders(<Harness value={20} />)

    await userEvent.click(minus())

    expect(field()).toHaveValue('0:00')
    expect(minus()).toBeDisabled()
  })

  test('stops at the longest duration it takes', async () => {
    renderWithProviders(<Harness value={3590} />)

    await userEvent.click(plus())

    expect(field()).toHaveValue('60:00')
    expect(plus()).toBeDisabled()
  })

  test('takes a typed duration, with or without the colon', async () => {
    const onChange = vi.fn()
    renderWithProviders(
      <AppDurationStepper label="Rest between sets" value={90} onChange={onChange} />,
    )

    await userEvent.clear(field())
    await userEvent.type(field(), '215')

    expect(onChange).toHaveBeenLastCalledWith(135)
  })

  // Clearing it is a half-typed state, not an answer of zero — the value stands
  // until a readable one replaces it, and the field snaps back on the way out.
  test('leaves the value alone while the field is empty', async () => {
    renderWithProviders(<Harness value={90} />)

    await userEvent.clear(field())
    expect(field()).toHaveValue('')

    await userEvent.tab()
    expect(field()).toHaveValue('1:30')
  })
})
