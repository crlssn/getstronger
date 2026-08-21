import { beforeEach, describe, expect, test, vi } from 'vitest'

import { selectActionButtonActive, useActionButton } from './actionButton'

const store = () => useActionButton.getState()

const Icon = () => null

describe('useActionButton', () => {
  beforeEach(() => {
    useActionButton.setState({ action: () => {}, icon: undefined })
  })

  test('starts inactive', () => {
    expect(selectActionButtonActive(store())).toBe(false)
  })

  test('becomes active once a view supplies a button', () => {
    const action = vi.fn()
    store().set({ action, icon: Icon })

    expect(selectActionButtonActive(store())).toBe(true)
    expect(store().icon).toBe(Icon)

    store().action()
    expect(action).toHaveBeenCalledOnce()
  })

  // Navigation resets the button, so a view without one does not inherit the
  // previous view's action.
  test('resets back to inactive with a harmless action', () => {
    store().set({ action: vi.fn(), icon: Icon })
    store().reset()

    expect(selectActionButtonActive(store())).toBe(false)
    expect(store().icon).toBeUndefined()
    expect(() => store().action()).not.toThrow()
  })
})
