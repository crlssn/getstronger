// @vitest-environment jsdom

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppEmptyState } from './AppEmptyState'

describe('AppEmptyState', () => {
  test('states what is missing', () => {
    renderWithProviders(
      <AppEmptyState action="none" title="No routines yet" body="Create your first one." />,
    )

    expect(screen.getByRole('heading', { name: 'No routines yet' })).toBeInTheDocument()
    expect(screen.getByText('Create your first one.')).toBeInTheDocument()
  })

  test('leaves out the body when there is none', () => {
    renderWithProviders(<AppEmptyState action="none" title="No routines yet" />)

    expect(screen.getByRole('heading')).toBeInTheDocument()
    expect(document.querySelectorAll('p')).toHaveLength(0)
  })

  // The rule this component exists to enforce: always offer a next step.
  test('offers a way out as a link', () => {
    renderWithProviders(
      <AppEmptyState
        action={{ label: 'Create a routine', to: '/routines/create' }}
        title="Empty"
      />,
    )

    expect(screen.getByRole('link', { name: 'Create a routine' })).toHaveAttribute(
      'href',
      '/routines/create',
    )
  })

  test('offers a way out as a button when there is nowhere to link', async () => {
    const onAction = vi.fn()
    renderWithProviders(
      <AppEmptyState action={{ label: 'Add an exercise' }} title="Empty" onAction={onAction} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add an exercise' }))

    expect(onAction).toHaveBeenCalledOnce()
  })

  // A screen with genuinely nowhere to go has to say so in its own markup,
  // where a reviewer sees the choice being made.
  test('offers nothing only when the screen said so explicitly', () => {
    renderWithProviders(<AppEmptyState action="none" title="Empty" />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('shows the action icon it is given', () => {
    renderWithProviders(
      <AppEmptyState
        action={{ label: 'Go', to: '/home' }}
        title="Empty"
        actionIcon={<svg data-testid="action-icon" />}
      />,
    )

    expect(screen.getByTestId('action-icon')).toBeInTheDocument()
  })

  // A first-run reader wants the concept explained once; a returning one
  // should not pay a screenful for it on every visit.
  describe('the explainer', () => {
    const render = () =>
      renderWithProviders(
        <AppEmptyState
          action={{ label: 'Create a plan', to: '/plans/create' }}
          title="No plans yet"
          body="A plan repeats your routines in order."
          learnMore={{
            label: 'How plans work',
            title: 'How plans work',
            children: <p>Choose routines, activate the plan, keep training.</p>,
          }}
        />,
      )

    test('stays behind a link until it is asked for', () => {
      render()

      expect(screen.getByRole('button', { name: 'How plans work' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(
        screen.queryByText('Choose routines, activate the plan, keep training.'),
      ).not.toBeInTheDocument()
    })

    test('opens in a sheet, beside the action rather than instead of it', async () => {
      render()

      await userEvent.click(screen.getByRole('button', { name: 'How plans work' }))

      const sheet = within(screen.getByRole('dialog'))
      expect(sheet.getByText('Choose routines, activate the plan, keep training.')).toBeVisible()
      expect(screen.getByRole('link', { name: 'Create a plan' })).toBeInTheDocument()
    })
  })
})
