// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { AppListItemInput } from './AppListItemInput'

describe('AppListItemInput', () => {
  const field = () => screen.getByRole('textbox')

  test('shows the value it is given', () => {
    render(<AppListItemInput model="Bench press" type="text" onUpdate={vi.fn()} />)

    expect(field()).toHaveValue('Bench press')
  })

  // Committing on every keystroke would hand the caller half-typed names.
  test('commits only once the field is left', async () => {
    const onUpdate = vi.fn()
    render(<AppListItemInput model="" type="text" onUpdate={onUpdate} />)

    await userEvent.type(field(), 'Squat')
    expect(onUpdate).not.toHaveBeenCalled()

    await userEvent.tab()
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith('Squat')
  })

  test('title-cases as the user types when asked to', async () => {
    render(<AppListItemInput model="" type="text" capitalise onUpdate={vi.fn()} />)

    await userEvent.type(field(), 'bench press')

    expect(field()).toHaveValue('Bench Press')
  })

  test('leaves the text alone when not asked to', async () => {
    render(<AppListItemInput model="" type="text" onUpdate={vi.fn()} />)

    await userEvent.type(field(), 'bench press')

    expect(field()).toHaveValue('bench press')
  })

  // A form reset, or a fetch landing, replaces what is in the field.
  test('follows a value changed underneath it', async () => {
    const { rerender } = render(<AppListItemInput model="Squat" type="text" onUpdate={vi.fn()} />)
    await userEvent.type(field(), ' variation')

    rerender(<AppListItemInput model="Deadlift" type="text" onUpdate={vi.fn()} />)

    expect(field()).toHaveValue('Deadlift')
  })

  test('passes other attributes through', () => {
    render(
      <AppListItemInput
        model=""
        type="email"
        placeholder="you@example.com"
        required
        onUpdate={vi.fn()}
      />,
    )

    expect(field()).toBeRequired()
    expect(field()).toHaveAttribute('type', 'email')
  })
})
