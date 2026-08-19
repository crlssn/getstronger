import { describe, expect, it } from 'vitest'
import { DistanceUnit, ExerciseMetric } from '@/proto/api/v1/shared_pb'
import {
  formatDurationDisplay,
  formatExerciseSet,
  formatMeasurementDuration,
  formatSetPace,
  isDistanceTimeExercise,
} from '@/utils/exerciseMeasurements'

const distanceTime = { metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME] }

describe('formatMeasurementDuration', () => {
  it('keeps the round-trippable m:ss input format', () => {
    expect(formatMeasurementDuration(1812)).toBe('30:12')
    expect(formatMeasurementDuration(45)).toBe('0:45')
  })
})

describe('formatDurationDisplay', () => {
  it('splits into minutes and seconds', () => {
    expect(formatDurationDisplay(1812)).toBe('30 min 12 sec')
  })

  it('drops the zero part', () => {
    expect(formatDurationDisplay(1800)).toBe('30 min')
    expect(formatDurationDisplay(45)).toBe('45 sec')
  })
})

describe('isDistanceTimeExercise', () => {
  it('matches only the exact distance × time pair', () => {
    expect(isDistanceTimeExercise(distanceTime)).toBe(true)
    expect(isDistanceTimeExercise({ metrics: [ExerciseMetric.DISTANCE] })).toBe(false)
    expect(
      isDistanceTimeExercise({
        metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME, ExerciseMetric.REPS],
      }),
    ).toBe(false)
    expect(isDistanceTimeExercise({ metrics: [] })).toBe(false)
  })
})

describe('formatSetPace', () => {
  it('formats minutes per distance unit', () => {
    expect(
      formatSetPace({ distance: 5, durationSeconds: 1812, distanceUnit: DistanceUnit.KILOMETERS }),
    ).toBe('6:02 min/km')
    expect(
      formatSetPace({ distance: 3, durationSeconds: 1500, distanceUnit: DistanceUnit.MILES }),
    ).toBe('8:20 min/mi')
  })

  it('returns undefined without both a distance and a time', () => {
    expect(formatSetPace({ distance: 0, durationSeconds: 1812 })).toBeUndefined()
    expect(formatSetPace({ distance: 5, durationSeconds: 0 })).toBeUndefined()
    expect(formatSetPace({})).toBeUndefined()
  })
})

describe('formatExerciseSet', () => {
  it('appends pace for distance × time exercises', () => {
    expect(
      formatExerciseSet(
        { distance: 5, durationSeconds: 1812, distanceUnit: DistanceUnit.KILOMETERS },
        distanceTime,
      ),
    ).toBe('5 km · 30 min 12 sec (6:02 min/km)')
  })

  it('leaves other metric combinations without a pace', () => {
    expect(
      formatExerciseSet({ weight: 92.5, reps: 3 }, { metrics: [] }),
    ).toBe('92.5 kg · 3')
    expect(
      formatExerciseSet(
        { distance: 1, durationSeconds: 90, reps: 4, distanceUnit: DistanceUnit.KILOMETERS },
        { metrics: [ExerciseMetric.REPS, ExerciseMetric.DISTANCE, ExerciseMetric.TIME] },
      ),
    ).toBe('4 · 1 km · 1 min 30 sec')
  })
})
