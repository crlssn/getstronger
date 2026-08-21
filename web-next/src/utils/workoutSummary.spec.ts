import type { MessageInitShape } from '@bufbuild/protobuf'

import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
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
    expect(summary.finishedDate).toBe('')
  })

  test('spells out the day it finished', () => {
    expect(
      workoutSummary(workout({ finishedAt: at('2026-08-14T09:30:00Z') })).finishedDate,
    ).toMatch(/^Friday, 14 August · \d{2}:\d{2}$/)
  })
})
