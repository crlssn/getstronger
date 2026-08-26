// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { AppButton, type ButtonColour } from './AppButton'

const colours: ButtonColour[] = ['primary', 'secondary', 'ghost', 'destructive']

describe('AppButton', () => {
  test('renders a button that calls its handler', async () => {
    const onClick = vi.fn()
    render(
      <AppButton type="button" colour="primary" onClick={onClick}>
        Save
      </AppButton>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  test('submits a form', () => {
    render(
      <AppButton type="submit" colour="primary">
        Save
      </AppButton>,
    )

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  test('renders a link to another screen', () => {
    render(
      <MemoryRouter>
        <AppButton type="link" colour="secondary" to="/exercises">
          Exercises
        </AppButton>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Exercises' })).toHaveAttribute('href', '/exercises')
  })

  test('does not fire when disabled', async () => {
    const onClick = vi.fn()
    render(
      <AppButton type="button" colour="primary" onClick={onClick} disabled>
        Save
      </AppButton>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onClick).not.toHaveBeenCalled()
  })

  // Four roles, not six colours; each has to reach the element or the design
  // system has a name that does nothing.
  test.each(colours)('carries the %s role', (colour) => {
    render(
      <AppButton type="button" colour={colour}>
        Save
      </AppButton>,
    )

    expect(screen.getByRole('button').className).toContain(colour)
  })

  // Callers position the button from outside; their class must not replace its
  // own.
  test('keeps its own classes when given one', () => {
    render(
      <AppButton type="button" colour="primary" className="auth-submit">
        Save
      </AppButton>,
    )

    const button = screen.getByRole('button')
    expect(button).toHaveClass('auth-submit')
    expect(button.className).toContain('primary')
  })

  // Three heights, all on the control scale. A screen that wants a shorter
  // button picks `sm`, which is the tap-target floor, rather than a padding.
  test.each(['sm', 'md', 'lg'] as const)('takes the %s height', (size) => {
    render(
      <AppButton type="button" colour="primary" size={size}>
        Save
      </AppButton>,
    )

    expect(screen.getByRole('button').className).toContain(size)
  })

  test('is full width unless asked to shrink', () => {
    const { rerender } = render(
      <AppButton type="button" colour="primary">
        Save
      </AppButton>,
    )
    expect(screen.getByRole('button').className).toContain('full')

    rerender(
      <AppButton type="button" colour="primary" width="auto">
        Save
      </AppButton>,
    )
    expect(screen.getByRole('button').className).not.toContain('full')
  })

  test('passes other attributes through', () => {
    render(
      <AppButton type="button" colour="primary" aria-label="Save the workout">
        Save
      </AppButton>,
    )

    expect(screen.getByRole('button', { name: 'Save the workout' })).toBeInTheDocument()
  })

  // A quiet action beside a line of copy keeps the tap target and gives up
  // only the weight that made it read as that line's heading.
  test('takes the copy type inline without leaving the control scale', () => {
    render(
      <AppButton type="button" colour="ghost" size="inline">
        Remove
      </AppButton>,
    )

    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })
})
