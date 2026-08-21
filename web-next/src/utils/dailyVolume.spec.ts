import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { create } from '@bufbuild/protobuf'
import { DateTime } from 'luxon'
import { describe, expect, test } from 'vitest'

import { WorkoutSchema } from '@/proto/api/v1/workout_service_pb'
import { dailyVolume, totalVolume, withinDays } from './dailyVolume'

const workout = (finishedAt: string | undefined, intensity: number) =>
  create(WorkoutSchema, {
    intensity,
    finishedAt: finishedAt ? timestampFromDate(new Date(finishedAt)) : undefined,
  })

describe('dailyVolume', () => {
  test('adds two sessions on one day into a single bar', () => {
    const bars = dailyVolume([
      workout('2026-08-14T08:00:00Z', 1200),
      workout('2026-08-14T18:00:00Z', 800),
    ])

    expect(bars).toHaveLength(1)
    expect(bars[0]?.volume).toBe(2000)
  })

  test('orders bars oldest first, whatever order they arrive in', () => {
    const bars = dailyVolume([
      workout('2026-08-16T08:00:00Z', 300),
      workout('2026-08-14T08:00:00Z', 100),
      workout('2026-08-15T08:00:00Z', 200),
    ])

    expect(bars.map((bar) => bar.volume)).toEqual([100, 200, 300])
    expect(bars.map((bar) => bar.timestamp)).toEqual([...bars.map((bar) => bar.timestamp)].sort())
  })

  test('labels each bar with its day', () => {
    expect(dailyVolume([workout('2026-08-14T08:00:00Z', 100)])[0]?.label).toBe('14 Aug')
  })

  // An unfinished workout has no volume to chart and no day to chart it on.
  test('ignores a workout that has not finished', () => {
    expect(dailyVolume([workout(undefined, 500)])).toEqual([])
  })
})

describe('withinDays', () => {
  const now = DateTime.fromISO('2026-08-21T12:00:00Z')

  test('keeps only what finished inside the range', () => {
    const recent = workout('2026-08-20T08:00:00Z', 100)
    const old = workout('2026-06-01T08:00:00Z', 900)

    expect(withinDays([recent, old], 7, now)).toEqual([recent])
  })

  test('drops a workout that never finished', () => {
    expect(withinDays([workout(undefined, 100)], 7, now)).toEqual([])
  })
})

describe('totalVolume', () => {
  test('sums the intensity of every workout given', () => {
    expect(
      totalVolume([workout('2026-08-20T08:00:00Z', 100), workout('2026-08-21T08:00:00Z', 250)]),
    ).toBe(350)
  })

  test('is zero for an empty range', () => {
    expect(totalVolume([])).toBe(0)
  })
})
