import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import AppEmptyState from './AppEmptyState'

describe('AppEmptyState', () => {
  test('renders the title and body, with no action for action="none"', () => {
    render(
      <AppEmptyState title="No routines yet" body="Create one to get started." action="none" />,
    )

    expect(screen.getByRole('heading', { name: 'No routines yet' })).toBeInTheDocument()
    expect(screen.getByText('Create one to get started.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  test('renders a link when the action has a destination', () => {
    render(
      <MemoryRouter>
        <AppEmptyState
          title="No exercises"
          action={{ label: 'Add exercise', to: '/exercises/new' }}
        />
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: 'Add exercise' })
    expect(link).toHaveAttribute('href', '/exercises/new')
  })

  test('renders a button and calls onAction when the action has no destination', () => {
    const onAction = vi.fn()
    render(
      <AppEmptyState title="No followers" action={{ label: 'Find people' }} onAction={onAction} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Find people' }))
    expect(onAction).toHaveBeenCalledOnce()
  })
})
