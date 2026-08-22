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

  test.each([
    ['success', 'success'],
    ['error', 'error'],
    ['warning', 'warning'],
    ['info', 'info'],
  ] as const)('%s raises a %s toast', (method, type) => {
    store()[method]('Saved')

    expect(store().toast).toEqual({ id: expect.any(Number), message: 'Saved', type })
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
    store().error('Failed')

    expect(store().toast).toMatchObject({ message: 'Failed', type: 'error' })
  })

  test('gives the replacement its own clock', () => {
    store().success('Saved')
    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    store().error('Failed')

    // The message it replaced must not take it away a millisecond later.
    vi.advanceTimersByTime(1)
    expect(store().toast).toMatchObject({ message: 'Failed' })

    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(store().toast).toBeNull()
  })

  test('leaves a dismissed toast dismissed', () => {
    store().success('Saved')
    store().dismiss()

    vi.advanceTimersByTime(TOAST_DURATION_MS)

    expect(store().toast).toBeNull()
  })

  // Effects run twice under StrictMode, and a request can fail the same way
  // twice in a row.
  test('restarts the clock of a repeated message rather than raising it again', () => {
    store().error('Failed')
    const raised = store().toast

    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    store().error('Failed')

    // Same toast, not a second one: the id is what the view keys on.
    expect(store().toast).toBe(raised)

    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    expect(store().toast).toBe(raised)

    vi.advanceTimersByTime(1)
    expect(store().toast).toBeNull()
  })

  test('tells apart the same message raised as two types', () => {
    store().info('Sync')
    const raised = store().toast

    store().warning('Sync')

    expect(store().toast).not.toBe(raised)
    expect(store().toast).toMatchObject({ type: 'warning' })
  })
})
