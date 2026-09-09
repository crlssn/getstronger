import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { DateTime } from 'luxon'
import { describe, expect, test } from 'vitest'

import { WorkoutSchema } from '@/proto/api/v1/workout_service_pb'
import { groupWorkoutsByMonth } from './workoutMonths'

const workout = (id: string, finishedAt: string | undefined, intensity = 0) =>
  create(WorkoutSchema, {
    id,
    intensity,
    finishedAt: finishedAt ? timestampFromDate(new Date(finishedAt)) : undefined,
  })

const now = DateTime.fromISO('2026-09-08T12:00:00Z')

const idsOf = (months: ReturnType<typeof groupWorkoutsByMonth>) =>
  months.map((month) => month.workouts.map((entry) => entry.id))

describe('groupWorkoutsByMonth', () => {
  test('gathers the sessions of one month under one group', () => {
    const months = groupWorkoutsByMonth(
      [
        workout('a', '2026-08-02T08:00:00Z'),
        workout('b', '2026-08-28T08:00:00Z'),
        workout('c', '2026-07-30T08:00:00Z'),
      ],
      now,
    )

    expect(months).toHaveLength(2)
    expect(idsOf(months)).toEqual([['b', 'a'], ['c']])
  })

  test('orders months newest first, and the sessions inside them too', () => {
    const months = groupWorkoutsByMonth(
      [
        workout('july', '2026-07-04T08:00:00Z'),
        workout('september-early', '2026-09-01T08:00:00Z'),
        workout('august', '2026-08-04T08:00:00Z'),
        workout('september-late', '2026-09-07T08:00:00Z'),
      ],
      now,
    )

    expect(idsOf(months)).toEqual([['september-late', 'september-early'], ['august'], ['july']])
  })

  // A page arriving later can only hold older sessions, so grouping the whole
  // list again is what keeps a month whole across the boundary between pages.
  test('keeps a month whole when its later sessions arrive on the next page', () => {
    const firstPage = [workout('a', '2026-09-07T08:00:00Z'), workout('b', '2026-09-02T08:00:00Z')]
    const months = groupWorkoutsByMonth(
      [...firstPage, workout('c', '2026-09-01T08:00:00Z'), workout('d', '2026-08-31T08:00:00Z')],
      now,
    )

    expect(idsOf(months)).toEqual([['a', 'b', 'c'], ['d']])
  })

  test('adds up the volume of the month, and counts what it holds', () => {
    const months = groupWorkoutsByMonth(
      [workout('a', '2026-08-02T08:00:00Z', 1200), workout('b', '2026-08-28T08:00:00Z', 800)],
      now,
    )

    expect(months[0]?.volume).toBe(2000)
    expect(months[0]?.workouts).toHaveLength(2)
  })

  // A month trained entirely on runs and rides has no volume to state, which
  // is not the same as having trained none.
  test('leaves a month that lifted nothing at no volume', () => {
    const months = groupWorkoutsByMonth([workout('a', '2026-08-02T08:00:00Z')], now)

    expect(months[0]?.volume).toBe(0)
  })

  test('names each month, and drops the year while it is the current one', () => {
    const months = groupWorkoutsByMonth(
      [workout('a', '2026-08-02T08:00:00Z'), workout('b', '2025-12-02T08:00:00Z')],
      now,
    )

    expect(months.map((month) => month.label)).toEqual(['August', 'December 2025'])
  })

  test('keys each month by its start, so a rerender does not remount the card', () => {
    const months = groupWorkoutsByMonth(
      [workout('a', '2026-08-02T08:00:00Z'), workout('b', '2026-08-28T08:00:00Z')],
      now,
    )

    expect(months[0]?.key).toBe('2026-08-01')
  })

  // Every workout the server sends carries a finish time, but a list that
  // silently dropped one would be a history missing a session.
  test('gathers sessions with no finish time into a last group of their own', () => {
    const months = groupWorkoutsByMonth(
      [workout('undated', undefined), workout('august', '2026-08-02T08:00:00Z')],
      now,
    )

    expect(idsOf(months)).toEqual([['august'], ['undated']])
    expect(months[1]?.label).toBeUndefined()
  })

  test('has no groups without workouts', () => {
    expect(groupWorkoutsByMonth([], now)).toEqual([])
  })
})
