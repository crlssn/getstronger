// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { AppTextarea } from './AppTextarea'

describe('AppTextarea', () => {
  test('takes what the user types', async () => {
    const onChange = vi.fn()
    render(<AppTextarea placeholder="How did it feel?" rows={3} onChange={onChange} />)

    await userEvent.type(screen.getByPlaceholderText('How did it feel?'), 'Strong')

    expect(onChange).toHaveBeenCalled()
  })

  test('is the height it is asked for', () => {
    render(<AppTextarea placeholder="How did it feel?" rows={5} />)

    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5')
  })

  test('shows a value it is given', () => {
    render(<AppTextarea placeholder="How did it feel?" rows={3} value="Strong" readOnly />)

    expect(screen.getByRole('textbox')).toHaveValue('Strong')
  })

  test('keeps its own styling when given a class', () => {
    render(<AppTextarea placeholder="How did it feel?" rows={3} className="mt-4" />)

    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveClass('mt-4')
    expect(textarea.className.split(' ').length).toBeGreaterThan(1)
  })

  // Three screens grew their own textarea by hand, each resetting the height
  // before measuring it. The behaviour belongs to the field.
  test('grows to fit what is typed', async () => {
    render(<AppTextarea placeholder="How did it feel?" rows={2} autosize />)

    const textarea = screen.getByRole('textbox')
    await userEvent.type(textarea, 'Strong')

    expect(textarea.style.height).not.toBe('')
  })
})
