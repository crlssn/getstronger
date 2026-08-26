import type { Timestamp } from '@bufbuild/protobuf/wkt'

import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  formatToCompactDateTime,
  formatToRelativeDateTime,
  formatToShortDateTime,
  formatUnixToRelativeDateTime,
  formatWorkoutDate,
} from './datetime'

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

describe('formatToCompactDateTime', () => {
  test('renders weekday, day, month and time', () => {
    expect(formatToCompactDateTime(timestamp)).toMatch(/^\w{3} \d{2} \w{3} \d{2}:\d{2}$/)
  })

  test('renders nothing without a timestamp', () => {
    expect(formatToCompactDateTime(undefined)).toBe('')
  })
})

describe('formatToShortDateTime', () => {
  test('renders a medium-length date', () => {
    expect(formatToShortDateTime(timestamp)).toContain('2026')
  })

  test('renders nothing without a timestamp', () => {
    expect(formatToShortDateTime(undefined)).toBe('')
  })
})

describe('formatToRelativeDateTime', () => {
  test('describes a past timestamp relative to now', () => {
    at('2026-03-18T09:30:00Z')

    expect(formatToRelativeDateTime(timestamp)).toBe('1 day ago')
  })

  test.each([
    ['exactly now', '2026-03-17T09:30:00Z'],
    ['a fraction of a second ago', '2026-03-17T09:30:00.300Z'],
    // A server timestamp can land ahead of the client clock; 'in 0 seconds'
    // reads as broken.
    ['slightly ahead of the client clock', '2026-03-17T09:29:59.500Z'],
  ])('says just now when the moment is %s', (_label, now) => {
    at(now)

    expect(formatToRelativeDateTime(timestamp)).toBe('Just now')
  })

  test('still counts once a full second has passed', () => {
    at('2026-03-17T09:30:02Z')

    expect(formatToRelativeDateTime(timestamp)).toBe('2 seconds ago')
  })

  test('renders nothing without a timestamp', () => {
    expect(formatToRelativeDateTime(undefined)).toBe('')
  })
})

describe('formatUnixToRelativeDateTime', () => {
  test('describes a past timestamp relative to now', () => {
    at('2026-03-18T09:30:00Z')

    expect(formatUnixToRelativeDateTime(seconds)).toBe('1 day ago')
  })

  test('says just now instead of counting zero seconds', () => {
    at('2026-03-17T09:30:00Z')

    expect(formatUnixToRelativeDateTime(seconds)).toBe('Just now')
  })

  test.each([undefined, 0n])('renders nothing for %o', (value) => {
    expect(formatUnixToRelativeDateTime(value)).toBe('')
  })
})

describe('formatWorkoutDate', () => {
  test('reads a workout inside the month as how long ago it was', () => {
    at('2026-03-20T09:30:00Z')

    expect(formatWorkoutDate(timestamp)).toBe('3 days ago')
  })

  // "7 weeks ago" says less than the day it fell on, and by then the weekday is
  // orientation rather than information.
  test('reads an older one as the date, with the weekday abbreviated', () => {
    at('2026-06-17T09:30:00Z')

    expect(formatWorkoutDate(timestamp)).toMatch(/^Tue, 17 March · \d{2}:\d{2}$/)
  })

  test('has nothing to say about a workout with no finish', () => {
    expect(formatWorkoutDate(undefined)).toBe('')
  })
})
