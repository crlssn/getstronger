import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { DateTime } from 'luxon'
import { describe, expect, test } from 'vitest'

import { WorkoutSchema } from '@/proto/api/v1/workout_service_pb'
import { workoutSummary } from './workoutSummary'

const at = (iso: string) => timestampFromDate(new Date(iso))

const workout = (fields: MessageInitShape<typeof WorkoutSchema>) => create(WorkoutSchema, fields)

describe('workoutSummary', () => {
  test('counts every set across every exercise', () => {
    const summary = workoutSummary(
      workout({
        exerciseSets: [
          { exercise: { id: 'a' }, sets: [{ id: '1' }, { id: '2' }] },
          { exercise: { id: 'b' }, sets: [{ id: '3' }] },
        ],
      }),
    )

    expect(summary.setCount).toBe(3)
  })

  test('counts only the sets marked a personal best', () => {
    const summary = workoutSummary(
      workout({
        exerciseSets: [
          {
            exercise: { id: 'a' },
            sets: [{ id: '1', metadata: { personalBest: true } }, { id: '2' }],
          },
          { exercise: { id: 'b' }, sets: [{ id: '3', metadata: { personalBest: true } }] },
        ],
      }),
    )

    expect(summary.personalBestCount).toBe(2)
  })

  test('rounds the duration to whole minutes', () => {
    expect(
      workoutSummary(
        workout({ startedAt: at('2026-08-14T10:00:00Z'), finishedAt: at('2026-08-14T11:02:40Z') }),
      ).durationMinutes,
    ).toBe(63)
  })

  // "0 min" reads as missing data rather than as a very short session.
  test('never reports a finished workout as zero minutes', () => {
    expect(
      workoutSummary(
        workout({ startedAt: at('2026-08-14T10:00:00Z'), finishedAt: at('2026-08-14T10:00:20Z') }),
      ).durationMinutes,
    ).toBe(1)
  })

  test('has no duration and no date for a workout that never finished', () => {
    const summary = workoutSummary(workout({ startedAt: at('2026-08-14T10:00:00Z') }))

    expect(summary.durationMinutes).toBe(0)
    expect(summary.finishedDay).toBe('')
    expect(summary.finishedDayKey).toBeUndefined()
    expect(summary.finishedTime).toBe('')
  })

  test('spells out the day it finished, and the clock time', () => {
    const summary = workoutSummary(
      workout({ finishedAt: at('2026-08-14T09:30:00Z') }),
      DateTime.fromISO('2026-08-20T12:00:00Z'),
    )

    expect(summary.finishedDay).toBe('14 August')
    expect(summary.finishedDayKey).toBeUndefined()
    expect(summary.finishedTime).toMatch(/^\d{2}:\d{2}$/)
  })

  test('keeps the year on a workout from a year gone by', () => {
    expect(
      workoutSummary(
        workout({ finishedAt: at('2025-08-14T09:30:00Z') }),
        DateTime.fromISO('2026-08-20T12:00:00Z'),
      ).finishedDay,
    ).toBe('14 August 2025')
  })

  test.each([
    ['today', '2026-08-20T06:00:00Z', 'activity.today'],
    ['yesterday', '2026-08-19T06:00:00Z', 'activity.yesterday'],
  ])('names the day a workout finished %s', (_label, finishedAt, key) => {
    expect(
      workoutSummary(
        workout({ finishedAt: at(finishedAt) }),
        DateTime.fromISO('2026-08-20T12:00:00Z'),
      ).finishedDayKey,
    ).toBe(key)
  })

  // Clock skew puts a finish time slightly in the future; that is still today.
  test('reads a finish time in the near future as today', () => {
    expect(
      workoutSummary(
        workout({ finishedAt: at('2026-08-20T14:00:00Z') }),
        DateTime.fromISO('2026-08-20T12:00:00Z'),
      ).finishedDayKey,
    ).toBe('activity.today')
  })

  test('has no name for the day two days ago', () => {
    expect(
      workoutSummary(
        workout({ finishedAt: at('2026-08-18T06:00:00Z') }),
        DateTime.fromISO('2026-08-20T12:00:00Z'),
      ).finishedDayKey,
    ).toBeUndefined()
  })
})
