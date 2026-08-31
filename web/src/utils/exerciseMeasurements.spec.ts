import { describe, expect, it } from 'vitest'
import { DistanceUnit, ExerciseMetric } from '@/proto/api/v1/shared_pb'
import {
  formatDistanceDisplay,
  formatDurationDisplay,
  formatExerciseSet,
  formatMeasurementDuration,
  formatPaceDisplay,
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

describe('formatDistanceDisplay', () => {
  it('shows a sub-kilometre distance in metres', () => {
    expect(formatDistanceDisplay(0.744)).toBe('744 m')
    expect(formatDistanceDisplay(0)).toBe('0 m')
  })

  it('keeps kilometres from one up', () => {
    expect(formatDistanceDisplay(1)).toBe('1 km')
    expect(formatDistanceDisplay(5.25)).toBe('5.25 km')
  })
})

describe('formatPaceDisplay', () => {
  it('writes seconds per kilometre as m:ss min/km', () => {
    expect(formatPaceDisplay(300)).toBe('5:00 min/km')
    expect(formatPaceDisplay(324.3)).toBe('5:24 min/km')
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

  it('joins weight and reps with the multiplication sign', () => {
    expect(formatExerciseSet({ weight: 92.5, reps: 3 }, { metrics: [] })).toBe('92.5 kg × 3')
    expect(
      formatExerciseSet(
        { weight: 60, reps: 8, distance: 1, distanceUnit: DistanceUnit.KILOMETERS },
        { metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS, ExerciseMetric.DISTANCE] },
      ),
    ).toBe('60 kg × 8 · 1 km')
  })

  it('shows a sub-kilometre set in metres', () => {
    expect(
      formatExerciseSet(
        { distance: 0.68, durationSeconds: 240, distanceUnit: DistanceUnit.KILOMETERS },
        distanceTime,
      ),
    ).toBe('680 m · 4 min (5:53 min/km)')
  })

  it('leaves miles alone below one', () => {
    expect(
      formatExerciseSet(
        { distance: 0.5, durationSeconds: 240, distanceUnit: DistanceUnit.MILES },
        distanceTime,
      ),
    ).toBe('0.5 mi · 4 min (8:00 min/mi)')
  })

  it('leaves other metric combinations without a pace', () => {
    expect(
      formatExerciseSet(
        { distance: 1, durationSeconds: 90, reps: 4, distanceUnit: DistanceUnit.KILOMETERS },
        { metrics: [ExerciseMetric.REPS, ExerciseMetric.DISTANCE, ExerciseMetric.TIME] },
      ),
    ).toBe('4 · 1 km · 1 min 30 sec')
  })
})
