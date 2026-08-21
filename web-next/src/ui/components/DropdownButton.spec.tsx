import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import '@/i18n'
import DropdownButton from './DropdownButton'

describe('DropdownButton', () => {
  test('falls back to the default aria-label when none is given', () => {
    render(
      <MemoryRouter>
        <DropdownButton items={[{ title: 'Edit', href: '/edit' }]} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Workout actions' })).toBeInTheDocument()
  })

  test('uses a custom label when given', () => {
    render(
      <MemoryRouter>
        <DropdownButton label="Workout options" items={[{ title: 'Edit', href: '/edit' }]} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Workout options' })).toBeInTheDocument()
  })

  test('opens to reveal a link item and a button item, and runs the button item', async () => {
    const onDelete = vi.fn()
    render(
      <MemoryRouter>
        <DropdownButton
          items={[
            { title: 'Edit routine', href: '/routines/1/edit' },
            { title: 'Delete routine', func: onDelete },
          ]}
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Workout actions' }))

    const link = await screen.findByRole('menuitem', { name: 'Edit routine' })
    expect(link).toHaveAttribute('href', '/routines/1/edit')

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete routine' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
