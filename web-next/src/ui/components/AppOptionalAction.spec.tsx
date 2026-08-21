// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { AppOptionalAction } from './AppOptionalAction'

describe('AppOptionalAction', () => {
  test('offers the addition by name', () => {
    render(<AppOptionalAction label="Add an exercise" />)

    expect(screen.getByRole('button', { name: /Add an exercise/ })).toBeInTheDocument()
  })

  test('explains itself when given a hint', () => {
    render(<AppOptionalAction label="Add an exercise" hint="Only for this workout" />)

    expect(screen.getByText('Only for this workout')).toBeInTheDocument()
  })

  test('shows no hint when there is none', () => {
    render(<AppOptionalAction label="Add an exercise" />)

    expect(document.querySelector('small')).toBeNull()
  })

  test('calls back when pressed', async () => {
    const onClick = vi.fn()
    render(<AppOptionalAction label="Add an exercise" onClick={onClick} />)

    await userEvent.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledOnce()
  })

  // The plus is decoration beside a label that already says what happens.
  test('hides its icon from screen readers', () => {
    render(<AppOptionalAction label="Add an exercise" />)

    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  // It must not read as the page's primary action.
  test('is a button rather than a submit', () => {
    render(<AppOptionalAction label="Add an exercise" />)

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })
})
