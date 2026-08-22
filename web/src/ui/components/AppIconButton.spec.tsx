// @vitest-environment jsdom

import { PlusIcon } from '@heroicons/react/24/outline'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import { AppIconButton } from './AppIconButton'

describe('AppIconButton', () => {
  // The icon is the whole label, so the label prop is the only thing standing
  // between a screen reader and an unnamed button.
  test('names itself after its label', async () => {
    const onClick = vi.fn()
    render(<AppIconButton label="Add exercise" icon={PlusIcon} onClick={onClick} />)

    await userEvent.click(screen.getByRole('button', { name: 'Add exercise' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  test('renders a link when given a destination', () => {
    render(
      <MemoryRouter>
        <AppIconButton label="New routine" icon={PlusIcon} to="/routines/new" />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'New routine' })).toHaveAttribute(
      'href',
      '/routines/new',
    )
  })

  test('carries its tone', () => {
    render(<AppIconButton label="Delete" icon={PlusIcon} tone="danger" />)

    expect(screen.getByRole('button').className).toContain('danger')
  })

  test('does not fire when disabled', async () => {
    const onClick = vi.fn()
    render(<AppIconButton label="Add" icon={PlusIcon} onClick={onClick} disabled />)

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onClick).not.toHaveBeenCalled()
  })
})
