// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppDurationStepper } from './AppDurationStepper'

const Harness = ({ value: initial = 90, ...rest }: { value?: number; max?: number }) => {
  const [value, setValue] = useState(initial)
  return (
    <AppDurationStepper label="Rest between sets" value={value} onChange={setValue} {...rest} />
  )
}

const value = () => screen.getByRole('spinbutton', { name: 'Rest between sets' })
const minus = () => screen.getByRole('button', { name: /Subtract 30 seconds/ })
const plus = () => screen.getByRole('button', { name: /Add 30 seconds/ })

describe('AppDurationStepper', () => {
  test('reads the duration off a clock rather than as a second count', () => {
    renderWithProviders(<Harness value={90} />)

    expect(value()).toHaveTextContent('1:30')
    expect(value()).toHaveAttribute('aria-valuenow', '90')
    expect(value()).toHaveAttribute('aria-valuetext', '1:30')
  })

  test('nudges the duration by a step in each direction', async () => {
    renderWithProviders(<Harness value={90} />)

    await userEvent.click(plus())
    expect(value()).toHaveTextContent('2:00')

    await userEvent.click(minus())
    await userEvent.click(minus())
    expect(value()).toHaveTextContent('1:00')
  })

  // The buttons name the field they belong to: a card holding several of them
  // would otherwise offer a screen reader four identical "Add 30 seconds".
  test('names each button after the field it adjusts', () => {
    renderWithProviders(<Harness />)

    expect(plus()).toHaveAccessibleName('Add 30 seconds to Rest between sets')
    expect(minus()).toHaveAccessibleName('Subtract 30 seconds from Rest between sets')
  })

  // The value is read rather than typed, so the arrow keys are what a keyboard
  // adjusts it with.
  test('moves with the arrow keys', async () => {
    renderWithProviders(<Harness value={90} />)

    value().focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(value()).toHaveTextContent('2:00')

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(value()).toHaveTextContent('1:00')
  })

  test('stops at zero rather than stepping past it', async () => {
    renderWithProviders(<Harness value={20} />)

    await userEvent.click(minus())

    expect(value()).toHaveTextContent('0:00')
    expect(minus()).toBeDisabled()
  })

  test('stops at the longest duration it takes', async () => {
    renderWithProviders(<Harness value={3590} />)

    await userEvent.click(plus())

    expect(value()).toHaveTextContent('60:00')
    expect(plus()).toBeDisabled()
  })
})
