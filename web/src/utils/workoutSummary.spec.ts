import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { describe, expect, test } from 'vitest'

import { DistanceUnit } from '@/proto/api/v1/shared_pb'
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

  // The summary carries every unit the session trained in, not just weight.
  test('totals reps, distance and set time across every exercise', () => {
    const summary = workoutSummary(
      workout({
        exerciseSets: [
          {
            exercise: { id: 'a' },
            sets: [
              { id: '1', reps: 8, weight: 60 },
              { id: '2', reps: 5, weight: 80 },
            ],
          },
          {
            exercise: { id: 'b' },
            sets: [
              {
                id: '3',
                distance: 2.5,
                distanceUnit: DistanceUnit.KILOMETERS,
                durationSeconds: 600,
              },
            ],
          },
        ],
      }),
    )

    expect(summary.totalReps).toBe(13)
    expect(summary.totalDistanceKm).toBe(2.5)
    expect(summary.totalSetSeconds).toBe(600)
  })

  test('totals mixed distance units in kilometers', () => {
    const summary = workoutSummary(
      workout({
        exerciseSets: [
          {
            exercise: { id: 'a' },
            sets: [
              { id: '1', distance: 1, distanceUnit: DistanceUnit.MILES },
              { id: '2', distance: 1, distanceUnit: DistanceUnit.KILOMETERS },
            ],
          },
        ],
      }),
    )

    expect(summary.totalDistanceKm).toBeCloseTo(2.61, 2)
  })

  test('reports zero totals for units the session never trained', () => {
    const summary = workoutSummary(workout({}))

    expect(summary.totalReps).toBe(0)
    expect(summary.totalDistanceKm).toBe(0)
    expect(summary.totalSetSeconds).toBe(0)
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
    expect(summary.finishedDate).toBe('')
  })

  // How long ago it was is what a reader scrolling a feed is asking; the day it
  // fell on is what they ask about a session from last spring.
  test('reads a recent workout as how long ago it was', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

    expect(
      workoutSummary(workout({ finishedAt: timestampFromDate(twoDaysAgo) })).finishedDate,
    ).toBe('2 days ago')
  })

  // Past a week a row carries the date and no time of day: the hour a session
  // ran is a fact about that session, not a timestamp on a list row.
  test('reads an older one as the date alone', () => {
    const lastYear = new Date('2020-08-14T09:30:00Z')

    expect(workoutSummary(workout({ finishedAt: timestampFromDate(lastYear) })).finishedDate).toBe(
      '14 Aug 2020',
    )
  })

  // The workout detail page is the one screen the hour belongs on.
  test('keeps the time of day for the page about the session', () => {
    const lastYear = new Date('2020-08-14T09:30:00Z')

    expect(
      workoutSummary(workout({ finishedAt: timestampFromDate(lastYear) })).finishedMoment,
    ).toMatch(/^Fri 14 Aug · \d{2}:\d{2}$/)
  })
})
