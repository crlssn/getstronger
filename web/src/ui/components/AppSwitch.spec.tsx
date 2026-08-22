// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import { AppSwitch } from './AppSwitch'

describe('AppSwitch', () => {
  test('says whether it is on', () => {
    const { rerender } = render(<AppSwitch label="Rest timer" checked={false} onChange={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Rest timer' })).not.toBeChecked()

    rerender(<AppSwitch label="Rest timer" checked onChange={vi.fn()} />)
    expect(screen.getByRole('switch', { name: 'Rest timer' })).toBeChecked()
  })

  test('reports the state it was flipped to', async () => {
    const onChange = vi.fn()
    render(<AppSwitch label="Rest timer" checked={false} onChange={onChange} />)

    await userEvent.click(screen.getByRole('switch'))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  test('does not flip while disabled', async () => {
    const onChange = vi.fn()
    render(<AppSwitch label="Rest timer" checked={false} disabled onChange={onChange} />)

    await userEvent.click(screen.getByRole('switch'))

    expect(onChange).not.toHaveBeenCalled()
  })
})
