// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { flushSync } from 'react-dom'
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

  // "3.5" backspaced to "3." parses to 3. The value moving is not a reason to
  // rewrite what is being typed: the point would vanish from under the caret
  // and the next digit would land against the whole number.
  test('keeps the point when a decimal is deleted back through', async () => {
    render(<Harness />)

    const field = screen.getByLabelText('Weight')
    await userEvent.type(field, '3.5{backspace}')

    expect(field).toHaveValue('3.')
  })

  test('lets a decimal be corrected digit by digit', async () => {
    render(<Harness />)

    const field = screen.getByLabelText('Weight')
    await userEvent.type(field, '3.5{backspace}7')

    expect(field).toHaveValue('3.7')
  })

  test('lets a stored decimal be corrected digit by digit', async () => {
    render(<Harness initial={62.5} />)

    const field = screen.getByLabelText('Weight')
    await userEvent.type(field, '{backspace}7')

    expect(field).toHaveValue('62.7')
  })

  test('snaps to the number when the field is left', async () => {
    render(<Harness />)

    const field = screen.getByLabelText('Weight')
    await userEvent.type(field, '3.')
    await userEvent.tab()

    expect(field).toHaveValue('3')
  })

  // The session log copies the previous set's value into an empty field while
  // it is being focused, flushed so the caret lands after the copy. Focus must
  // not shut that write out.
  test('takes a value written into an empty field on focus', async () => {
    const Prefilling = () => {
      const [value, setValue] = useState<number | undefined>()
      return (
        <AppNumberField
          aria-label="Weight"
          value={value}
          onChange={setValue}
          // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the session log flushes the copy so the caret lands after it; the spec has to as well
          onFocus={() => flushSync(() => setValue(80))}
        />
      )
    }
    render(<Prefilling />)

    const field = screen.getByLabelText('Weight')
    await userEvent.click(field)

    expect(field).toHaveValue('80')
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
