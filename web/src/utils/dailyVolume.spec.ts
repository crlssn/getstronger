import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { create } from '@bufbuild/protobuf'
import { DateTime } from 'luxon'
import { describe, expect, test } from 'vitest'

import { WorkoutSchema } from '@/proto/api/v1/workout_service_pb'
import { dailyVolume, rangeSeries, totalVolume, volumeSeries, withinRange } from './dailyVolume'

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

describe('withinRange', () => {
  // A Friday afternoon, so a rolling "now minus seven days" would reach back
  // into the morning of the eighth calendar day.
  const now = DateTime.fromISO('2026-08-21T15:00:00')

  test('keeps only what finished inside the range', () => {
    const recent = workout('2026-08-20T08:00:00', 100)
    const old = workout('2026-06-01T08:00:00', 900)

    expect(withinRange([recent, old], '7D', now)).toEqual([recent])
  })

  test('spans seven calendar days, today included', () => {
    const first = workout('2026-08-15T00:30:00', 100)
    const eighth = workout('2026-08-14T23:30:00', 100)

    expect(withinRange([first, eighth], '7D', now)).toEqual([first])
  })

  test('drops a workout that never finished', () => {
    expect(withinRange([workout(undefined, 100)], '7D', now)).toEqual([])
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

// 25 daily bars in a 390px card come out about 4px wide, with their date
// labels rotated 45 degrees and the value callout clipped by the plot edge.
describe('volumeSeries', () => {
  const daily = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      workout(DateTime.fromISO('2026-08-01').plus({ days: index }).toISO() ?? '', 100),
    )

  test('keeps daily bars while they still have room', () => {
    const series = volumeSeries(daily(12))

    expect(series.granularity).toBe('day')
    expect(series.points).toHaveLength(12)
  })

  test('aggregates to weeks once there are too many days to draw', () => {
    const series = volumeSeries(daily(28))

    expect(series.granularity).toBe('week')
    // Four weeks and change, not 28 slivers.
    expect(series.points.length).toBeLessThanOrEqual(6)
  })

  // Weeks alone only help somebody who trains daily. A year of training once a
  // week is 52 bars at either grain.
  test('goes on to months when weeks are still too many', () => {
    const weekly = Array.from({ length: 52 }, (_, index) =>
      workout(DateTime.fromISO('2026-01-05').plus({ weeks: index }).toISO() ?? '', 100),
    )
    const series = volumeSeries(weekly)

    expect(series.granularity).toBe('month')
    expect(series.points.length).toBeLessThanOrEqual(14)
  })

  test('labels a monthly bar with its month and year', () => {
    const weekly = Array.from({ length: 52 }, (_, index) =>
      workout(DateTime.fromISO('2026-01-05').plus({ weeks: index }).toISO() ?? '', 100),
    )

    expect(volumeSeries(weekly).points[0]?.label).toMatch(/^\w{3} \d{4}$/)
  })

  test('loses nothing to aggregation', () => {
    const series = volumeSeries(daily(28))

    expect(series.points.reduce((total, point) => total + point.volume, 0)).toBe(2800)
  })

  test('labels a weekly bar with the day that week began', () => {
    const series = volumeSeries(daily(28))

    expect(series.points[0]?.label).toMatch(/^\d{1,2} \w{3}$/)
  })

  test('orders weekly bars oldest first', () => {
    const timestamps = volumeSeries(daily(28)).points.map((point) => point.timestamp)

    expect(timestamps).toEqual([...timestamps].sort((first, second) => first - second))
  })

  test('has nothing to draw for no workouts', () => {
    expect(volumeSeries([]).points).toEqual([])
  })
})

// The grain is the range's, not the data's: how often somebody trained must
// not decide whether 4W is drawn in days or weeks.
describe('rangeSeries', () => {
  const now = DateTime.fromISO('2026-08-21T15:00:00')

  test.each([
    ['7D', 'day', 7],
    ['4W', 'week', 4],
    ['3M', 'week', 13],
    ['1Y', 'month', 12],
  ] as const)('draws %s by the %s, %i bars', (range, granularity, count) => {
    const series = rangeSeries([], range, now)

    expect(series.granularity).toBe(granularity)
    expect(series.points).toHaveLength(count)
  })

  // Squeezing out an empty week lets bars sit side by side that were a month
  // apart, so the spacing stops tracking time.
  test('keeps an empty bucket, at zero', () => {
    const series = rangeSeries(
      [workout('2026-08-21T08:00:00', 300), workout('2026-08-15T08:00:00', 100)],
      '7D',
      now,
    )

    expect(series.points.map((point) => point.volume)).toEqual([100, 0, 0, 0, 0, 0, 300])
  })

  test('ends the last day on today', () => {
    expect(rangeSeries([], '7D', now).points.at(-1)?.label).toBe('21 Aug')
  })

  // Weeks count back from today, so every one is seven whole days and none
  // is the fragment a calendar week would leave at the start.
  test('buckets weeks in whole sevens ending today', () => {
    const series = rangeSeries(
      [
        workout('2026-07-25T08:00:00', 100),
        workout('2026-07-31T20:00:00', 200),
        workout('2026-08-15T08:00:00', 400),
        workout('2026-07-24T20:00:00', 900),
      ],
      '4W',
      now,
    )

    expect(series.points.map((point) => point.label)).toEqual([
      '25 Jul',
      '1 Aug',
      '8 Aug',
      '15 Aug',
    ])
    expect(series.points.map((point) => point.volume)).toEqual([300, 0, 0, 400])
  })

  test('draws a year as the twelve months ending with this one', () => {
    const series = rangeSeries([workout('2025-09-03T08:00:00', 700)], '1Y', now)

    expect(series.points[0]?.label).toMatch(/^Sept? 2025$/)
    expect(series.points.at(-1)?.label).toBe('Aug 2026')
    expect(series.points[0]?.volume).toBe(700)
  })

  test('orders bars oldest first', () => {
    const timestamps = rangeSeries([], '3M', now).points.map((point) => point.timestamp)

    expect(timestamps).toEqual([...timestamps].sort((first, second) => first - second))
  })
})
