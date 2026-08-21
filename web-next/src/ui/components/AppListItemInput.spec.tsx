import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import AppListItemInput from './AppListItemInput'

describe('AppListItemInput', () => {
  test('seeds the input from model and commits on blur', () => {
    const onUpdate = vi.fn()
    render(<AppListItemInput model="Bench press" type="text" onUpdate={onUpdate} />)

    const input = screen.getByDisplayValue('Bench press')
    fireEvent.change(input, { target: { value: 'Incline bench press' } })
    expect(onUpdate).not.toHaveBeenCalled()

    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith('Incline bench press')
  })

  test('capitalises each word as it is typed when capitalise is set', () => {
    render(<AppListItemInput model="" type="text" capitalise onUpdate={vi.fn()} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'leg day/upper body' } })
    fireEvent.keyUp(input)

    expect(input).toHaveValue('Leg Day/Upper Body')
  })

  test('resets to a new model value from the parent', () => {
    const { rerender } = render(<AppListItemInput model="Squat" type="text" onUpdate={vi.fn()} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Something typed' } })
    rerender(<AppListItemInput model="Deadlift" type="text" onUpdate={vi.fn()} />)

    expect(screen.getByRole('textbox')).toHaveValue('Deadlift')
  })

  test('passes placeholder and required through', () => {
    render(
      <AppListItemInput
        model=""
        type="email"
        placeholder="you@example.com"
        required
        onUpdate={vi.fn()}
      />,
    )

    const input = screen.getByPlaceholderText('you@example.com')
    expect(input).toHaveAttribute('type', 'email')
    expect(input).toBeRequired()
  })
})
