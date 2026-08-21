// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { renderWithProviders } from '@/ui/testing'
import { AppSheet, SheetAction } from './AppSheet'

const dialog = () => screen.getByRole('dialog')

describe('AppSheet', () => {
  test('renders an accessible dialog labelled by its title', () => {
    renderWithProviders(<AppSheet title="Leave workout?" onClose={vi.fn()} />)

    const panel = dialog()
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Leave workout?' })).toHaveAttribute(
      'id',
      panel.getAttribute('aria-labelledby'),
    )
  })

  test('renders eyebrow, body, and the drag handle', () => {
    renderWithProviders(
      <AppSheet
        title="Leave workout?"
        eyebrow="Autosaved"
        eyebrowTone="success"
        body="Your progress is saved on this device."
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Autosaved').className).toContain('success')
    expect(screen.getByText('Your progress is saved on this device.')).toBeInTheDocument()
    expect(document.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  test('omits eyebrow, body, close button, and empty regions when not provided', () => {
    renderWithProviders(<AppSheet title="Add exercise" onClose={vi.fn()} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(dialog().textContent).toBe('Add exercise')
  })

  test('renders its content and actions', async () => {
    const onSave = vi.fn()
    renderWithProviders(
      <AppSheet
        title="Add exercise"
        onClose={vi.fn()}
        actions={
          <SheetAction tone="primary" onClick={onSave}>
            Save
          </SheetAction>
        }
      >
        <ul>
          <li>Bench press</li>
        </ul>
      </AppSheet>,
    )

    expect(screen.getByText('Bench press')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledOnce()
  })

  test('closes from the labelled close button', async () => {
    const onClose = vi.fn()
    renderWithProviders(
      <AppSheet title="Add exercise" closeLabel="Close exercise picker" onClose={onClose} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Close exercise picker' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  test('closes on backdrop click but not on panel click', async () => {
    const onClose = vi.fn()
    renderWithProviders(<AppSheet title="Leave workout?" onClose={onClose} />)

    await userEvent.click(dialog())
    expect(onClose).not.toHaveBeenCalled()

    const backdrop = dialog().parentElement
    if (backdrop) await userEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('closes on Escape', async () => {
    const onClose = vi.fn()
    renderWithProviders(<AppSheet title="Leave workout?" onClose={onClose} />)

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  test('stops listening for Escape once it is gone', async () => {
    const onClose = vi.fn()
    const { unmount } = renderWithProviders(<AppSheet title="Leave workout?" onClose={onClose} />)

    unmount()
    await userEvent.keyboard('{Escape}')

    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('SheetAction', () => {
  // The ranking is the sheet's design, so the tone is a prop rather than a
  // class a caller invents.
  test.each(['primary', 'danger', 'dangerOutline', 'tertiary'] as const)(
    'carries the %s tone',
    (tone) => {
      renderWithProviders(<SheetAction tone={tone}>Confirm</SheetAction>)

      expect(screen.getByRole('button').className).toContain(tone)
    },
  )

  test('does not fire when disabled', async () => {
    const onClick = vi.fn()
    renderWithProviders(
      <SheetAction tone="primary" onClick={onClick} disabled>
        Confirm
      </SheetAction>,
    )

    await userEvent.click(screen.getByRole('button'))

    expect(onClick).not.toHaveBeenCalled()
  })
})
