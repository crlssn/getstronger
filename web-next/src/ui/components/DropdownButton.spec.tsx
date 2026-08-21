// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import type { DropdownItem } from '@/types/dropdown'
import { renderWithProviders } from '@/ui/testing'
import { DropdownButton } from './DropdownButton'

const open = async (name = 'Workout actions') =>
  await userEvent.click(screen.getByRole('button', { name }))

describe('DropdownButton', () => {
  const navigate: DropdownItem = { title: 'Edit', href: '/exercises/1/edit' }

  test('keeps its menu closed until it is asked for', () => {
    renderWithProviders(<DropdownButton items={[navigate]} />)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('shows the items once opened', async () => {
    renderWithProviders(<DropdownButton items={[navigate, { title: 'Delete' }]} />)

    await open()

    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  test('navigates from an item with a destination', async () => {
    renderWithProviders(<DropdownButton items={[navigate]} />)

    await open()

    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/exercises/1/edit',
    )
  })

  test('runs an item that acts', async () => {
    const func = vi.fn().mockResolvedValue(undefined)
    renderWithProviders(<DropdownButton items={[{ title: 'Delete', func }]} />)

    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(func).toHaveBeenCalledOnce()
  })

  // An item that acts rather than navigates is destructive — every one of them
  // today is a delete — so it must not look like the rest.
  test('marks an acting item as destructive', async () => {
    renderWithProviders(<DropdownButton items={[navigate, { title: 'Delete' }]} />)

    await open()

    expect(screen.getByRole('menuitem', { name: 'Delete' }).className).toContain('danger')
    expect(screen.getByRole('menuitem', { name: 'Edit' }).className).not.toContain('danger')
  })

  // The trigger is an ellipsis with no text, so without a label a screen
  // reader has nothing to announce.
  test('labels its trigger', () => {
    renderWithProviders(<DropdownButton items={[navigate]} />)

    expect(screen.getByRole('button', { name: 'Workout actions' })).toBeInTheDocument()
  })

  test('takes a label of its own', () => {
    renderWithProviders(<DropdownButton items={[navigate]} label="Routine actions" />)

    expect(screen.getByRole('button', { name: 'Routine actions' })).toBeInTheDocument()
  })

  test('can be driven from the keyboard', async () => {
    renderWithProviders(<DropdownButton items={[navigate]} />)

    await userEvent.tab()
    await userEvent.keyboard('{Enter}')

    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
  })
})
