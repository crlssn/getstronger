// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { AppInput } from './AppInput'

describe('AppInput', () => {
  test('labels the field it renders', () => {
    render(<AppInput label="Email" type="email" />)

    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
  })

  test('takes what the user types', async () => {
    const onChange = vi.fn()
    render(<AppInput label="Name" onChange={onChange} value="" />)

    await userEvent.type(screen.getByLabelText('Name'), 'Squat')

    expect(onChange).toHaveBeenCalled()
  })

  test('renders the hint under the label', () => {
    render(<AppInput label="Username" hint="Letters and numbers only." />)

    expect(screen.getByText('Letters and numbers only.')).toBeInTheDocument()
  })

  // A field inside a sheet or a toolbar carries its name in an aria-label
  // instead, and must still be reachable by it.
  test('renders without a visible label', () => {
    render(<AppInput aria-label="Routine name" />)

    expect(screen.getByLabelText('Routine name')).toBeInTheDocument()
  })

  test('keeps a caller-supplied id so a form can point at it', () => {
    render(<AppInput id="edit-name" label="Name" />)

    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'edit-name')
  })

  test('marks an invalid field for assistive technology', () => {
    render(<AppInput label="Email" invalid />)

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  test('passes other attributes through', () => {
    render(<AppInput label="Email" required autoComplete="email" />)

    const input = screen.getByLabelText('Email')
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('autocomplete', 'email')
  })

  test('positions from the outside without losing its own classes', () => {
    const { container } = render(<AppInput label="Email" className="mt-4" />)

    expect(container.firstElementChild).toHaveClass('mt-4')
    expect(container.firstElementChild?.className.split(' ').length).toBeGreaterThan(1)
  })

  // The one field a screen is built around raises its label to the overline
  // register, and is still the same labelled input underneath.
  test('draws as the hero field without losing the field it is', async () => {
    const onChange = vi.fn()
    const { container } = render(
      <AppInput variant="hero" label="Routine name" value="" onChange={onChange} />,
    )

    const input = screen.getByLabelText('Routine name')
    await userEvent.type(input, 'Upper body')

    expect(onChange).toHaveBeenCalled()
    expect(container.firstElementChild?.className).not.toBe(
      render(<AppInput label="Routine name" />).container.firstElementChild?.className,
    )
  })

  // A reveal toggle, a unit, a clear button: whatever sits at the trailing edge
  // belongs inside the field's border rather than beside it.
  test('renders a trailing control inside the field', () => {
    render(<AppInput label="Password" trailing={<button type="button">Show</button>} />)

    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument()
  })
})
