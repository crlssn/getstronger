import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import AppSheet from './AppSheet'

describe('AppSheet', () => {
  test('renders an accessible dialog labelled by its title', () => {
    render(<AppSheet title="Leave workout?" onClose={vi.fn()} />)

    const panel = screen.getByRole('dialog')
    expect(panel).toHaveAttribute('aria-modal', 'true')
    const heading = screen.getByRole('heading', { name: 'Leave workout?' })
    expect(panel).toHaveAttribute('aria-labelledby', heading.id)
  })

  test('renders eyebrow and body', () => {
    render(
      <AppSheet
        title="Leave workout?"
        eyebrow="Autosaved"
        eyebrowTone="success"
        body="Your progress is saved on this device."
        onClose={vi.fn()}
      />,
    )

    const eyebrow = screen.getByText('Autosaved')
    expect(eyebrow).toHaveClass('text-success')
    expect(screen.getByText('Your progress is saved on this device.')).toBeInTheDocument()
  })

  test('omits eyebrow, body, close button, and empty regions when not provided', () => {
    const { container } = render(<AppSheet title="Add exercise" onClose={vi.fn()} />)

    expect(screen.queryByText('Autosaved')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // Only the heading's wrapper and the header remain inside the panel.
    expect(container.querySelectorAll('.mt-4')).toHaveLength(0)
  })

  test('renders slotted content and actions', () => {
    render(
      <AppSheet
        title="Add exercise"
        actions={
          <button type="button" className="primary">
            Save
          </button>
        }
        onClose={vi.fn()}
      >
        <ul className="options">
          <li>Bench press</li>
        </ul>
      </AppSheet>,
    )

    expect(screen.getByText('Bench press')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  test('closes from the labelled close button', () => {
    const onClose = vi.fn()
    render(<AppSheet title="Add exercise" closeLabel="Close exercise picker" onClose={onClose} />)

    const close = screen.getByRole('button', { name: 'Close exercise picker' })
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('closes on backdrop click but not on panel click', () => {
    const onClose = vi.fn()
    render(<AppSheet title="Leave workout?" onClose={onClose} />)

    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalledOnce()
  })

  test('closes on Escape', () => {
    const onClose = vi.fn()
    render(<AppSheet title="Leave workout?" onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
