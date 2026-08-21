import { describe, expect, test } from 'vitest'

import { workoutTabTimer } from './workoutClock'

const now = Date.parse('2026-08-14T12:00:00Z')
const secondsAgo = (seconds: number) => now - seconds * 1000
const secondsAhead = (seconds: number) => now + seconds * 1000

describe('workoutTabTimer', () => {
  test('shows nothing when no workout is running', () => {
    expect(workoutTabTimer(now)).toBe('')
  })

  test.each([
    [0, '0m 00s'],
    [9, '0m 09s'],
    [65, '1m 05s'],
    [599, '9m 59s'],
    [3599, '59m 59s'],
  ])('counts %i seconds elapsed as %s', (elapsed, expected) => {
    expect(workoutTabTimer(now, secondsAgo(elapsed))).toBe(expected)
  })

  // Past an hour the seconds stop being useful and stop fitting under an icon.
  test.each([
    [3600, '1h 00m'],
    [3660, '1h 01m'],
    [7325, '2h 02m'],
  ])('counts %i seconds elapsed as %s', (elapsed, expected) => {
    expect(workoutTabTimer(now, secondsAgo(elapsed))).toBe(expected)
  })

  // The rest timer is the number the user is waiting on.
  test.each([
    [1, '0:01'],
    [30, '0:30'],
    [90, '1:30'],
    [125, '2:05'],
  ])('shows %i seconds of rest as %s', (remaining, expected) => {
    expect(workoutTabTimer(now, secondsAgo(600), secondsAhead(remaining))).toBe(expected)
  })

  test('falls back to the elapsed time once the rest timer runs out', () => {
    expect(workoutTabTimer(now, secondsAgo(600), secondsAgo(1))).toBe('10m 00s')
  })

  test('falls back to the elapsed time at the exact moment rest ends', () => {
    expect(workoutTabTimer(now, secondsAgo(600), now)).toBe('10m 00s')
  })

  // A clock that has drifted backwards must not render a negative duration.
  test('never counts below zero', () => {
    expect(workoutTabTimer(now, secondsAhead(30))).toBe('0m 00s')
  })

  test('shows the rest countdown even with no elapsed time to fall back on', () => {
    expect(workoutTabTimer(now, undefined, secondsAhead(45))).toBe('0:45')
  })
})
