// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppStepper } from './AppStepper'

const haptics = vi.hoisted(() => ({ haptic: vi.fn() }))
vi.mock('@/native/haptics', () => haptics)

const Harness = ({ value: initial = 3, ...rest }: { value?: number; max?: number }) => {
  const [value, setValue] = useState(initial)
  return (
    <AppStepper
      label="Rounds"
      value={value}
      onChange={setValue}
      format={(rounds) => `${rounds}x`}
      decreaseLabel="One round fewer"
      increaseLabel="One round more"
      max={5}
      {...rest}
    />
  )
}

const value = () => screen.getByRole('spinbutton', { name: 'Rounds' })
const minus = () => screen.getByRole('button', { name: 'One round fewer' })
const plus = () => screen.getByRole('button', { name: 'One round more' })

describe('AppStepper', () => {
  beforeEach(() => {
    haptics.haptic.mockReset()
  })

  test('ticks once for each step it takes', async () => {
    renderWithProviders(<Harness value={3} />)

    await userEvent.click(plus())

    expect(haptics.haptic).toHaveBeenCalledExactlyOnceWith('selection')
  })

  // The buttons disable at each end, but the arrow keys do not.
  test('stays still when a step would pass its limit', async () => {
    renderWithProviders(<Harness value={5} />)

    value().focus()
    await userEvent.keyboard('{ArrowUp}')

    expect(value()).toHaveTextContent('5x')
    expect(haptics.haptic).not.toHaveBeenCalled()
  })

  // What is shown and what is announced are the same string, so a value read
  // out never disagrees with the one on the screen.
  test('shows the value as its caller formats it', () => {
    renderWithProviders(<Harness value={3} />)

    expect(value()).toHaveTextContent('3x')
    expect(value()).toHaveAttribute('aria-valuenow', '3')
    expect(value()).toHaveAttribute('aria-valuetext', '3x')
  })

  test('nudges the value by a step in each direction', async () => {
    renderWithProviders(<Harness value={3} />)

    await userEvent.click(plus())
    expect(value()).toHaveTextContent('4x')

    await userEvent.click(minus())
    await userEvent.click(minus())
    expect(value()).toHaveTextContent('2x')
  })

  // The value is read rather than typed, so the arrow keys are what a keyboard
  // adjusts it with.
  test('moves with the arrow keys', async () => {
    renderWithProviders(<Harness value={3} />)

    value().focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(value()).toHaveTextContent('4x')

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(value()).toHaveTextContent('2x')
  })

  test('stops at each end rather than stepping past it', async () => {
    renderWithProviders(<Harness value={1} />)

    await userEvent.click(minus())
    expect(value()).toHaveTextContent('0x')
    expect(minus()).toBeDisabled()

    for (let press = 0; press < 5; press += 1) await userEvent.click(plus())
    expect(value()).toHaveTextContent('5x')
    expect(plus()).toBeDisabled()
  })
})
