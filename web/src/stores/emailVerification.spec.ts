// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  defaultResendCooldownSeconds,
  selectHasPendingEmail,
  useEmailVerificationStore,
} from './emailVerification'

const store = () => useEmailVerificationStore.getState()

describe('useEmailVerificationStore', () => {
  beforeEach(() => {
    sessionStorage.clear()
    useEmailVerificationStore.setState({
      pendingEmail: '',
      lastSentAt: 0,
      retryAfterSeconds: defaultResendCooldownSeconds,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('starts with nothing pending', () => {
    expect(selectHasPendingEmail(store())).toBe(false)
  })

  test('records an address without claiming an email was sent', () => {
    store().setPendingEmail('alex@example.com')

    expect(selectHasPendingEmail(store())).toBe(true)
    expect(store().pendingEmail).toBe('alex@example.com')
    expect(store().lastSentAt).toBe(0)
  })

  // Re-recording the same address must not restart a cooldown that is running.
  test('leaves a running cooldown alone when the address has not changed', () => {
    store().markSent('alex@example.com', 30)
    const sentAt = store().lastSentAt

    store().setPendingEmail('alex@example.com')

    expect(store().lastSentAt).toBe(sentAt)
    expect(store().retryAfterSeconds).toBe(30)
  })

  test('clears a running cooldown when the address changes', () => {
    store().markSent('alex@example.com', 30)

    store().setPendingEmail('sam@example.com')

    expect(store().lastSentAt).toBe(0)
    expect(store().retryAfterSeconds).toBe(defaultResendCooldownSeconds)
  })

  test('starts the cooldown the server asked for', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-17T09:30:00Z'))

    store().markSent('alex@example.com', 90)

    expect(store().lastSentAt).toBe(Date.parse('2026-03-17T09:30:00Z'))
    expect(store().retryAfterSeconds).toBe(90)
  })

  test.each([0, -1])('falls back to the default cooldown for %i seconds', (cooldown) => {
    store().markSent('alex@example.com', cooldown)

    expect(store().retryAfterSeconds).toBe(defaultResendCooldownSeconds)
  })

  test('clears everything', () => {
    store().markSent('alex@example.com', 30)

    store().clear()

    expect(selectHasPendingEmail(store())).toBe(false)
    expect(store().lastSentAt).toBe(0)
    expect(store().retryAfterSeconds).toBe(defaultResendCooldownSeconds)
  })

  // Session storage, not local: a reload keeps the recovery path, but the
  // address must not outlive the browser session on a shared device.
  test('persists to session storage only', () => {
    store().markSent('alex@example.com')

    expect(JSON.parse(sessionStorage.getItem('emailVerification') ?? '{}')).toMatchObject({
      state: { pendingEmail: 'alex@example.com' },
    })
    expect(localStorage.getItem('emailVerification')).toBeNull()
  })
})
