import { describe, expect, test } from 'vitest'

import { isFinalCountdown, restLabel, restProgress, restRemainingSeconds } from './restTimer'

const now = Date.parse('2026-08-14T12:00:00Z')

describe('restRemainingSeconds', () => {
  test('is nothing when no timer is running', () => {
    expect(restRemainingSeconds(now)).toBe(0)
  })

  test.each([
    [1_000, 1],
    [30_000, 30],
    [90_500, 91],
  ])('counts %i milliseconds ahead as %i seconds', (ahead, expected) => {
    expect(restRemainingSeconds(now, now + ahead)).toBe(expected)
  })

  test('never goes below zero once the timer has passed', () => {
    expect(restRemainingSeconds(now, now - 5_000)).toBe(0)
  })
})

describe('restLabel', () => {
  // Zero-padded so the banner's width does not jump as it counts down.
  test.each([
    [0, '00:00'],
    [5, '00:05'],
    [59, '00:59'],
    [60, '01:00'],
    [125, '02:05'],
    [600, '10:00'],
  ])('renders %i seconds as %s', (seconds, expected) => {
    expect(restLabel(seconds)).toBe(expected)
  })
})

describe('restProgress', () => {
  test.each([
    [90, 90, '100%'],
    [45, 90, '50%'],
    [0, 90, '0%'],
  ])('renders %i of %i as %s', (remaining, total, expected) => {
    expect(restProgress(remaining, total)).toBe(expected)
  })

  // A draft saved before the total was recorded has nothing to be a fraction
  // of, and an empty bar beats a bar of NaN width.
  test.each([0, -1])('renders nothing for a total of %i', (total) => {
    expect(restProgress(30, total)).toBe('0%')
  })

  test('never overflows when the clock drifts', () => {
    expect(restProgress(120, 90)).toBe('100%')
  })
})

describe('the final stretch', () => {
  test.each([
    [10, true],
    [1, true],
    [11, false],
    [0, false],
  ])('%i seconds is the final countdown: %s', (seconds, expected) => {
    expect(isFinalCountdown(seconds)).toBe(expected)
  })
})
