// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { AppOptionRow } from './AppOptionRow'

const haptics = vi.hoisted(() => ({ haptic: vi.fn() }))
vi.mock('@/native/haptics', () => haptics)

describe('AppOptionRow', () => {
  beforeEach(() => {
    haptics.haptic.mockReset()
  })

  test('ticks once when an unchosen option is chosen', async () => {
    render(
      <AppOptionRow selected={false} onClick={vi.fn()}>
        Bench Press
      </AppOptionRow>,
    )

    await userEvent.click(screen.getByRole('button'))

    expect(haptics.haptic).toHaveBeenCalledExactlyOnceWith('selection')
  })

  // A row that picks and closes is navigation, and the chosen row is already
  // the value: neither changes anything a finger should feel.
  test('stays still for a picking row and for the chosen one', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<AppOptionRow onClick={onClick}>Bench Press</AppOptionRow>)
    await userEvent.click(screen.getByRole('button'))

    rerender(
      <AppOptionRow selected onClick={onClick}>
        Bench Press
      </AppOptionRow>,
    )
    await userEvent.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledTimes(2)
    expect(haptics.haptic).not.toHaveBeenCalled()
  })

  test('picks the option it was pressed on', async () => {
    const onClick = vi.fn()
    render(<AppOptionRow onClick={onClick}>Bench Press</AppOptionRow>)

    await userEvent.click(screen.getByRole('button', { name: 'Bench Press' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  // A row that picks and closes has no pressed state to report; a row that
  // toggles has one, and it must reach assistive technology rather than only
  // the tick mark.
  test('reports a toggle state only when it has one', () => {
    const { rerender } = render(<AppOptionRow onClick={vi.fn()}>Bench Press</AppOptionRow>)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed')

    rerender(
      <AppOptionRow selected={false} onClick={vi.fn()}>
        Bench Press
      </AppOptionRow>,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')

    rerender(
      <AppOptionRow selected onClick={vi.fn()}>
        Bench Press
      </AppOptionRow>,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  test('renders what sits either side of the copy', () => {
    render(
      <AppOptionRow leading={<span>1</span>} trailing={<span>go</span>} onClick={vi.fn()}>
        Bench Press
      </AppOptionRow>,
    )

    const row = screen.getByRole('button')
    expect(row).toHaveTextContent('1')
    expect(row).toHaveTextContent('go')
  })

  test('takes the flat variant for a row inside a divided list', () => {
    render(
      <AppOptionRow flat onClick={vi.fn()}>
        Bench Press
      </AppOptionRow>,
    )

    expect(screen.getByRole('button').className).toContain('flat')
  })
})
