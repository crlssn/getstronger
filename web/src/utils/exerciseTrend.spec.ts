import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { describe, expect, test } from 'vitest'

import { DistanceUnit, SetSchema, WeightUnit } from '@/proto/api/v1/shared_pb'
import { downSample, estimateOneRepMax, trendByDay, trendBySet, trendChange } from './exerciseTrend'

// Spelled out rather than spread: `create` also accepts a built Set, and a
// spread of a partial init matches that overload instead.
interface SetFields {
  weight?: number
  reps?: number
  weightUnit?: WeightUnit
  distance?: number
  durationSeconds?: number
  distanceUnit?: DistanceUnit
}

const set = (createdAt: string | undefined, fields: SetFields = {}) =>
  create(SetSchema, {
    weight: fields.weight,
    reps: fields.reps,
    weightUnit: fields.weightUnit,
    distance: fields.distance,
    durationSeconds: fields.durationSeconds,
    distanceUnit: fields.distanceUnit,
    metadata: createdAt ? { createdAt: timestampFromDate(new Date(createdAt)) } : undefined,
  })

describe('estimateOneRepMax', () => {
  test('is the weight itself for a single', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100)
  })

  test('scales with the reps beyond one', () => {
    expect(estimateOneRepMax(100, 6)).toBeCloseTo(120)
  })
})

describe('trendByDay', () => {
  test('gives a day its best set, not its last', () => {
    const day = trendByDay([
      set('2026-08-14T08:00:00Z', { weight: 100, reps: 5 }),
      set('2026-08-14T09:00:00Z', { weight: 80, reps: 5 }),
    ])[0]

    expect(day?.weight).toBe(100)
    expect(day?.reps).toBe(5)
  })

  // Volume is the one measure that answers "how much did I do", so it adds up
  // where the others take the best.
  test('sums the volume across a day', () => {
    const day = trendByDay([
      set('2026-08-14T08:00:00Z', { weight: 100, reps: 5 }),
      set('2026-08-14T09:00:00Z', { weight: 80, reps: 5 }),
    ])[0]

    expect(day?.volume).toBe(900)
  })

  // Sets logged years apart may have been recorded under different unit
  // preferences, so they are converted before being compared.
  test('compares weights in one unit', () => {
    const day = trendByDay([
      set('2026-08-14T08:00:00Z', { weight: 100, reps: 1, weightUnit: WeightUnit.KILOGRAMS }),
      set('2026-08-14T09:00:00Z', { weight: 200, reps: 1, weightUnit: WeightUnit.POUNDS }),
    ])[0]

    // 200 lbs is about 91 kg, so the 100 kg set is still the day's best.
    expect(day?.weight).toBe(100)
  })

  test('runs oldest first', () => {
    const days = trendByDay([
      set('2026-08-16T08:00:00Z', { weight: 30, reps: 1 }),
      set('2026-08-14T08:00:00Z', { weight: 10, reps: 1 }),
      set('2026-08-15T08:00:00Z', { weight: 20, reps: 1 }),
    ])

    expect(days.map((day) => day.weight)).toEqual([10, 20, 30])
  })

  test('ignores a set with no date to plot it against', () => {
    expect(trendByDay([set(undefined, { weight: 100, reps: 5 })])).toEqual([])
  })
})

describe('trendBySet', () => {
  test('keeps every set as its own point, oldest first', () => {
    const points = trendBySet([
      set('2026-08-14T09:00:00Z', { distance: 0.74, durationSeconds: 240 }),
      set('2026-08-14T08:00:00Z', { distance: 0.68, durationSeconds: 240 }),
      set('2026-08-13T08:00:00Z', { distance: 0.6, durationSeconds: 235 }),
    ])

    expect(points.map((point) => point.distance)).toEqual([0.6, 0.68, 0.74])
    expect(points.map((point) => point.durationSeconds)).toEqual([235, 240, 240])
  })

  test('derives each set its pace in seconds per kilometre', () => {
    const [point] = trendBySet([
      set('2026-08-14T08:00:00Z', { distance: 0.8, durationSeconds: 240 }),
    ])

    expect(point?.pace).toBeCloseTo(300)
  })

  test('compares paces in one unit', () => {
    const [point] = trendBySet([
      set('2026-08-14T08:00:00Z', {
        distance: 1,
        durationSeconds: 483,
        distanceUnit: DistanceUnit.MILES,
      }),
    ])

    // 483 seconds over a mile is almost exactly 5:00 min/km.
    expect(point?.pace).toBeCloseTo(300, 0)
  })

  test('leaves the pace at zero without both halves of it', () => {
    const points = trendBySet([
      set('2026-08-14T08:00:00Z', { distance: 0.8 }),
      set('2026-08-14T09:00:00Z', { durationSeconds: 240 }),
    ])

    expect(points.map((point) => point.pace)).toEqual([0, 0])
  })

  test('ignores a set with no date to plot it against', () => {
    expect(trendBySet([set(undefined, { distance: 0.8, durationSeconds: 240 })])).toEqual([])
  })
})

describe('trendChange', () => {
  test('is the whole-percent move from first to last', () => {
    expect(trendChange([100, 110, 125])).toBe(25)
    expect(trendChange([100, 75])).toBe(-25)
  })

  test('is nothing to report with fewer than two points', () => {
    expect(trendChange([100])).toBeUndefined()
    expect(trendChange([])).toBeUndefined()
  })

  // Dividing by it would be Infinity, which is not a percentage.
  test('is nothing to report when the first value is zero', () => {
    expect(trendChange([0, 50])).toBeUndefined()
  })
})

describe('downSample', () => {
  test('leaves a short series alone', () => {
    expect(downSample([1, 2, 3], 5)).toEqual([1, 2, 3])
  })

  test('thins a long series to within the limit', () => {
    const sampled = downSample(
      Array.from({ length: 500 }, (_, index) => index),
      60,
    )

    expect(sampled.length).toBeLessThanOrEqual(61)
    expect(sampled[0]).toBe(0)
  })

  // The most recent point is the one the reader came for, and a fixed step
  // lands on it only when the length divides evenly.
  test('always keeps the last point', () => {
    const data = Array.from({ length: 101 }, (_, index) => index)

    expect(downSample(data, 10).at(-1)).toBe(100)
  })
})
