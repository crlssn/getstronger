import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { TOAST_DURATION_MS, useToastStore } from './toasts'

const store = () => useToastStore.getState()

describe('useToastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    store().dismiss()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('raises a success toast', () => {
    store().success('Saved')

    expect(store().toast).toEqual({ id: expect.any(Number), message: 'Saved' })
  })

  test('dismisses a toast on its own after a few seconds', () => {
    store().success('Saved')

    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    expect(store().toast).not.toBeNull()

    vi.advanceTimersByTime(1)
    expect(store().toast).toBeNull()
  })

  test('dismisses a toast before its time is up', () => {
    store().success('Saved')

    store().dismiss()

    expect(store().toast).toBeNull()
  })

  // The newest message is the one the user just caused.
  test('replaces the message before it', () => {
    store().success('Saved')
    store().success('Also saved')

    expect(store().toast).toMatchObject({ message: 'Also saved' })
  })

  test('gives the replacement its own clock', () => {
    store().success('Saved')
    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    store().success('Also saved')

    // The message it replaced must not take it away a millisecond later.
    vi.advanceTimersByTime(1)
    expect(store().toast).toMatchObject({ message: 'Also saved' })

    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(store().toast).toBeNull()
  })

  test('leaves a dismissed toast dismissed', () => {
    store().success('Saved')
    store().dismiss()

    vi.advanceTimersByTime(TOAST_DURATION_MS)

    expect(store().toast).toBeNull()
  })

  // Effects run twice under StrictMode, so a save can report the same way
  // twice in a row.
  test('restarts the clock of a repeated message rather than raising it again', () => {
    store().success('Saved')
    const raised = store().toast

    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    store().success('Saved')

    // Same toast, not a second one: the id is what the view keys on.
    expect(store().toast).toBe(raised)

    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    expect(store().toast).toBe(raised)

    vi.advanceTimersByTime(1)
    expect(store().toast).toBeNull()
  })
})
