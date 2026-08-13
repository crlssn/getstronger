import { describe, expect, it } from 'vitest'
import { DateTime } from 'luxon'

import {
  activityBucketFor,
  activityBucketLabelKey,
  activityBucketOrder,
  routineActivityBucketFor,
  routineActivityBucketLabelKey,
  routineActivityBucketOrder,
} from './activityBuckets'
import { en, sv } from '@/i18n/messages'

const now = DateTime.fromISO('2026-08-09T12:00:00')

describe('activityBucketFor', () => {
  it.each([
    ['earlier today', now.minus({ hours: 3 }), 'today'],
    ['at the start of today', now.startOf('day'), 'today'],
    ['yesterday', now.minus({ days: 1 }), 'week'],
    ['seven days ago', now.minus({ days: 7 }), 'week'],
    ['eight days ago', now.minus({ days: 8 }), 'month'],
    ['thirty days ago', now.minus({ days: 30 }), 'month'],
    ['thirty-one days ago', now.minus({ days: 31 }), 'older'],
    ['a year ago', now.minus({ years: 1 }), 'older'],
  ])('buckets %s as %s', (_label, performedAt, expected) => {
    expect(activityBucketFor(performedAt, now)).toBe(expected)
  })

  it('treats a missing timestamp as never performed', () => {
    expect(activityBucketFor(undefined, now)).toBe('never')
  })

  it('treats an invalid timestamp as never performed', () => {
    expect(activityBucketFor(DateTime.fromISO('nonsense'), now)).toBe('never')
  })

  it('does not let a late-evening session yesterday read as today', () => {
    const lateYesterday = now.minus({ days: 1 }).set({ hour: 23, minute: 59 })
    expect(activityBucketFor(lateYesterday, now)).toBe('week')
  })

  it('reads a future timestamp as today rather than never', () => {
    expect(activityBucketFor(now.plus({ hours: 2 }), now)).toBe('today')
  })

  it('names every bucket with a key present in both locales', () => {
    for (const bucket of activityBucketOrder) {
      const key = activityBucketLabelKey(bucket).replace('activity.', '')
      expect(en.activity).toHaveProperty(key)
      expect(sv.activity).toHaveProperty(key)
    }
  })
})

describe('routineActivityBucketFor', () => {
  it.each([
    ['a routine used today', now, 'today'],
    ['a routine used last week', now.minus({ days: 7 }), 'week'],
    ['a routine used this month', now.minus({ days: 29 }), 'month'],
    ['a routine unused for 30 days', now.minus({ days: 30 }), 'revisit'],
    ['a routine unused for longer', now.minus({ years: 1 }), 'revisit'],
    ['an untried routine', undefined, 'revisit'],
  ])('buckets %s as %s', (_label, performedAt, expected) => {
    expect(routineActivityBucketFor(performedAt, now)).toBe(expected)
  })

  it('names every routine bucket with a key present in both locales', () => {
    for (const bucket of routineActivityBucketOrder) {
      const key = routineActivityBucketLabelKey(bucket).replace('activity.', '')
      expect(en.activity).toHaveProperty(key)
      expect(sv.activity).toHaveProperty(key)
    }
  })
})
