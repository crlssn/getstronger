import { DateTime } from 'luxon'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { groupByActivity, groupByRoutineActivity } from './activityGroups'

interface Item {
  name: string
  performedAt?: string
}

const group = (items: Item[]) =>
  groupByActivity(
    items,
    (item) => (item.performedAt ? DateTime.fromISO(item.performedAt) : undefined),
    (item) => item.name,
  )

describe('groupByActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('groups by how recently each was performed, most recent group first', () => {
    const groups = group([
      { name: 'Old', performedAt: '2026-01-01T09:00:00Z' },
      { name: 'Today', performedAt: '2026-08-14T09:00:00Z' },
      { name: 'Never' },
    ])

    expect(groups.map((entry) => entry.bucket)).toEqual(['today', 'older', 'never'])
    expect(groups.map((entry) => entry.items.map((item) => item.name))).toEqual([
      ['Today'],
      ['Old'],
      ['Never'],
    ])
  })

  test('leaves out a group nothing falls into', () => {
    expect(group([{ name: 'Today', performedAt: '2026-08-14T09:00:00Z' }])).toHaveLength(1)
  })

  test('puts the newest on top within a group', () => {
    const groups = group([
      { name: 'Morning', performedAt: '2026-08-14T06:00:00Z' },
      { name: 'Evening', performedAt: '2026-08-14T20:00:00Z' },
    ])

    expect(groups[0]?.items.map((item) => item.name)).toEqual(['Evening', 'Morning'])
  })

  // Nothing performed has no date to sort by, so the fallback has to be stable.
  test('falls back to name order for items never performed', () => {
    const groups = group([{ name: 'Zercher' }, { name: 'Ab wheel' }])

    expect(groups[0]?.items.map((item) => item.name)).toEqual(['Ab wheel', 'Zercher'])
  })

  test('orders names the way a reader would, not by code point', () => {
    const groups = group([{ name: 'Row 10' }, { name: 'Row 2' }, { name: 'row 1' }])

    expect(groups[0]?.items.map((item) => item.name)).toEqual(['row 1', 'Row 2', 'Row 10'])
  })

  test('carries the label key each group renders with', () => {
    expect(group([{ name: 'Never' }])[0]?.labelKey).toBe('activity.never')
  })

  test('is empty for nothing', () => {
    expect(group([])).toEqual([])
  })
})

describe('groupByRoutineActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-14T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const routineGroups = (items: Item[]) =>
    groupByRoutineActivity(
      items,
      (item) => (item.performedAt ? DateTime.fromISO(item.performedAt) : undefined),
      (item) => item.name,
    )

  // A routine unused for a month and one never tried are both things to pick up
  // again, and splitting them leaves two thin groups saying the same thing.
  test('puts a long-unused routine in with the untried ones', () => {
    const groups = routineGroups([
      { name: 'Stale', performedAt: '2026-01-01T09:00:00Z' },
      { name: 'Never' },
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.bucket).toBe('revisit')
    expect(groups[0]?.items.map((item) => item.name)).toEqual(['Stale', 'Never'])
  })

  test('keeps a recently trained routine in its own group', () => {
    const groups = routineGroups([
      { name: 'Today', performedAt: '2026-08-14T09:00:00Z' },
      { name: 'Never' },
    ])

    expect(groups.map((group) => group.bucket)).toEqual(['today', 'revisit'])
  })
})
