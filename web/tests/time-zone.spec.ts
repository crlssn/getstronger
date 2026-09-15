import { describe, expect, test } from 'vitest'

import { suiteTimeZone } from './timeZone'

const offsetOn = (iso: string) => new Date(iso).getTimezoneOffset()

describe('the suite time zone', () => {
  // Without this the suite is only as deterministic as the machine running it,
  // and nothing says so until a test that passed for a year fails on a laptop.
  test('is pinned by the config rather than taken from the machine', () => {
    expect(process.env.TZ).toBe(suiteTimeZone)
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(suiteTimeZone)
  })

  // The point of pinning somewhere other than UTC: local and UTC have to
  // disagree, or a component reading either one looks correct.
  test('is somewhere local time differs from UTC', () => {
    expect(offsetOn('2026-08-14T09:00:00Z')).not.toBe(0)
  })

  // A zone that shifts in summer makes the wall clock an instant lands on
  // depend on the month the fixture picked.
  test('does not observe daylight saving', () => {
    expect(offsetOn('2026-01-14T09:00:00Z')).toBe(offsetOn('2026-07-14T09:00:00Z'))
  })
})
