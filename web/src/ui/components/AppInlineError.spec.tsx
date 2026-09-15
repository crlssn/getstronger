import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const haptics = vi.hoisted(() => ({ haptic: vi.fn() }))

vi.mock('@/native/haptics', () => haptics)

import { AppInlineError } from './AppInlineError'

describe('AppInlineError', () => {
  beforeEach(() => {
    haptics.haptic.mockReset()
  })

  it('announces itself as an alert', () => {
    render(<AppInlineError>Could not save</AppInlineError>)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
  })

  it('carries an id so a field can be described by it', () => {
    render(<AppInlineError id="field-error">Username is taken</AppInlineError>)
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'field-error')
  })

  // The hand that pressed the button is usually still on the phone, and a
  // refusal is the one outcome worth feeling before it is read.
  it('buzzes the phone as the refusal appears', () => {
    render(<AppInlineError>Could not save</AppInlineError>)
    expect(haptics.haptic).toHaveBeenCalledExactlyOnceWith('actionFailed')
  })

  it('buzzes once for one refusal, however often it rerenders', () => {
    const { rerender } = render(<AppInlineError>Could not save</AppInlineError>)
    rerender(<AppInlineError>Could not save</AppInlineError>)

    expect(haptics.haptic).toHaveBeenCalledOnce()
  })
})
