// @vitest-environment jsdom

import { HandThumbUpIcon } from '@heroicons/react/24/outline'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { AppReactionButton } from './AppReactionButton'

describe('AppReactionButton', () => {
  test('carries the count and says what a tap would do', async () => {
    const user = userEvent.setup()
    const react = vi.fn()
    render(
      <AppReactionButton
        icon={HandThumbUpIcon}
        label="Rep this workout, 3 reps"
        count={3}
        pressed={false}
        onClick={react}
      />,
    )

    const control = screen.getByRole('button', { name: 'Rep this workout, 3 reps' })
    expect(control).toHaveTextContent('3')
    expect(control).toHaveAttribute('aria-pressed', 'false')

    await user.click(control)
    expect(react).toHaveBeenCalledOnce()
  })

  test('states that it is pressed rather than only colouring it', () => {
    render(
      <AppReactionButton
        icon={HandThumbUpIcon}
        label="Remove your rep, 4 reps"
        count={4}
        pressed
      />,
    )

    expect(screen.getByRole('button', { name: 'Remove your rep, 4 reps' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('does not react while it is disabled', async () => {
    const user = userEvent.setup()
    const react = vi.fn()
    render(
      <AppReactionButton
        icon={HandThumbUpIcon}
        label="Rep this workout, 0 reps"
        count={0}
        pressed={false}
        disabled
        onClick={react}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Rep this workout, 0 reps' }))

    expect(react).not.toHaveBeenCalled()
  })
})
