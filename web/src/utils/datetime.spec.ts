import type { Timestamp } from '@bufbuild/protobuf/wkt'

import { afterEach, describe, expect, test, vi } from 'vitest'

import { formatMoment, formatTimestamp, formatUnixTimestamp } from './datetime'

// 2026-03-17T09:30:00Z, a Tuesday.
const seconds = 1773739800n
const timestamp = { seconds } as Timestamp

const at = (isoUtc: string) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(isoUtc))
}

afterEach(() => {
  vi.useRealTimers()
})

// One rule everywhere a timestamp sits on a row. The feed alone used to mix
// "Just now", "25 seconds ago", "7 days ago", "Wed, 8 July · 14:15" and
// "26 Aug 2026".
describe('formatTimestamp', () => {
  test.each([
    ['exactly now', '2026-03-17T09:30:00Z'],
    ['a fraction of a second ago', '2026-03-17T09:30:00.300Z'],
    // A server timestamp can land ahead of the client clock; "in 0 seconds"
    // reads as broken.
    ['slightly ahead of the client clock', '2026-03-17T09:29:59.500Z'],
    ['under a minute ago', '2026-03-17T09:30:40Z'],
  ])('says just now when the moment is %s', (_label, now) => {
    at(now)

    expect(formatTimestamp(timestamp)).toBe('Just now')
  })

  // Seconds are noise on a row: a feed of them reads as broken rather than
  // fresh, which is what a dozen consecutive "25 seconds ago" cards did.
  test('counts in minutes under the hour', () => {
    at('2026-03-17T09:52:00Z')

    expect(formatTimestamp(timestamp)).toBe('22 minutes ago')
  })

  test('counts in hours under the day', () => {
    at('2026-03-17T14:30:00Z')

    expect(formatTimestamp(timestamp)).toBe('5 hours ago')
  })

  test('counts in days under the week', () => {
    at('2026-03-20T09:30:00Z')

    expect(formatTimestamp(timestamp)).toBe('3 days ago')
  })

  // Past a week the day it fell on says more than the count of days.
  test('gives the date once it is a week old', () => {
    at('2026-03-25T09:30:00Z')

    expect(formatTimestamp(timestamp)).toBe('17 Mar 2026')
  })

  test('gives the date for anything older', () => {
    at('2026-06-17T09:30:00Z')

    expect(formatTimestamp(timestamp)).toBe('17 Mar 2026')
  })

  // Time of day belongs on the workout detail page, not on a row.
  test('never carries a time of day', () => {
    at('2026-06-17T09:30:00Z')

    expect(formatTimestamp(timestamp)).not.toMatch(/\d{2}:\d{2}/)
  })

  test('renders nothing without a timestamp', () => {
    expect(formatTimestamp(undefined)).toBe('')
  })
})

describe('formatUnixTimestamp', () => {
  test('follows the same rule as everything else', () => {
    at('2026-03-20T09:30:00Z')

    expect(formatUnixTimestamp(seconds)).toBe('3 days ago')
  })

  test.each([undefined, 0n])('renders nothing for %o', (value) => {
    expect(formatUnixTimestamp(value)).toBe('')
  })
})

// The one place a time of day is a fact about the session rather than a
// timestamp on a row.
describe('formatMoment', () => {
  test('renders the weekday, the date and the time', () => {
    expect(formatMoment(timestamp)).toMatch(/^Tue, 17 March · \d{2}:\d{2}$/)
  })

  test('renders nothing without a timestamp', () => {
    expect(formatMoment(undefined)).toBe('')
  })
})
