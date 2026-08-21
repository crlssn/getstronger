import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import AppButton from './AppButton'

describe('AppButton', () => {
  test('renders a native button for type="button" and "submit"', () => {
    render(
      <AppButton type="submit" colour="primary">
        Save
      </AppButton>,
    )

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'submit')
  })

  test('renders a router link for type="link"', () => {
    render(
      <MemoryRouter>
        <AppButton type="link" to="/workouts/1" colour="secondary">
          View
        </AppButton>
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: 'View' })
    expect(link).toHaveAttribute('href', '/workouts/1')
  })

  test('disables the button and merges the caller class', () => {
    render(
      <AppButton type="button" colour="ghost" disabled className="auth-submit">
        Cancel
      </AppButton>,
    )

    const button = screen.getByRole('button', { name: 'Cancel' })
    expect(button).toBeDisabled()
    expect(button.className).toContain('auth-submit')
  })
})
