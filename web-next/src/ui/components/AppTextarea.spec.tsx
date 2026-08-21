import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import AppTextarea from './AppTextarea'

describe('AppTextarea', () => {
  test('renders a textarea with the given placeholder and row count', () => {
    render(<AppTextarea placeholder="Notes for this workout" rows={4} />)

    const textarea = screen.getByPlaceholderText('Notes for this workout')
    expect(textarea.tagName).toBe('TEXTAREA')
    expect(textarea).toHaveAttribute('rows', '4')
  })
})
