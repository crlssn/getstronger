import { beforeEach, describe, expect, test } from 'vitest'

import { useAlertStore } from './alerts'

const store = () => useAlertStore.getState()

describe('useAlertStore', () => {
  beforeEach(() => {
    useAlertStore.setState({ alert: null })
  })

  test.each([
    ['setSuccess', 'success', false],
    ['setError', 'error', false],
    ['setSuccessWithoutPageRefresh', 'success', true],
    ['setErrorWithoutPageRefresh', 'error', true],
  ] as const)('%s raises a %s alert seen=%s', (method, type, seen) => {
    store()[method]('Saved')

    expect(store().alert).toEqual({ message: 'Saved', type, seen })
  })

  test('clears the alert', () => {
    store().setSuccess('Saved')
    store().clear()

    expect(store().alert).toBeNull()
  })

  // An alert raised before a navigation is only shown once it has survived one,
  // so marking it seen is what lets the next navigation dismiss it.
  test('marks an alert seen without discarding it', () => {
    store().setSuccess('Saved')
    store().markSeen()

    expect(store().alert).toEqual({ message: 'Saved', type: 'success', seen: true })
  })

  test('does nothing when marking seen with no alert raised', () => {
    store().markSeen()

    expect(store().alert).toBeNull()
  })
})
