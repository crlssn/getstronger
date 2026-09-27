import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { DateTime } from 'luxon'

import { dateLocale } from '@/i18n'

export interface DailyVolume {
  label: string
  timestamp: number
  volume: number
}

/**
 * Sums workout intensity per calendar day, oldest first.
 *
 * Two sessions on the same day are one bar on the chart, which is what makes
 * the shape read as training volume rather than as session count.
 */
export const dailyVolume = (workouts: readonly Workout[]): DailyVolume[] => {
  const buckets = new Map<string, DailyVolume>()

  workouts.forEach((workout) => {
    if (!workout.finishedAt) return
    const finishedAt = DateTime.fromSeconds(Number(workout.finishedAt.seconds))
    if (!finishedAt.isValid) return

    const key = finishedAt.toISODate()
    if (!key) return

    buckets.set(key, {
      label: finishedAt.setLocale(dateLocale()).toFormat('d LLL'),
      timestamp: finishedAt.toMillis(),
      volume: (buckets.get(key)?.volume ?? 0) + workout.intensity,
    })
  })

  return [...buckets.values()].sort((first, second) => first.timestamp - second.timestamp)
}

export type VolumeGranularity = 'day' | 'week' | 'month'

export interface VolumeSeries {
  granularity: VolumeGranularity
  points: DailyVolume[]
}

/**
 * Past this the card is drawing slivers: 390px leaves the plot about 300px, so
 * 14 bars is around 21px each. At 52 they come out at 4px, under a fan of
 * labels rotated 45 degrees, with the value callout clipped by the plot edge.
 */
const maxBars = 14

const grains = [
  { granularity: 'day', unit: 'day', format: 'd LLL' },
  { granularity: 'week', unit: 'week', format: 'd LLL' },
  { granularity: 'month', unit: 'month', format: 'LLL yyyy' },
] as const

/** Sums workout intensity per bucket of `unit`, oldest first. */
const bucketedVolume = (
  workouts: readonly Workout[],
  unit: 'day' | 'week' | 'month',
  format: string,
): DailyVolume[] => {
  const buckets = new Map<string, DailyVolume>()

  workouts.forEach((workout) => {
    if (!workout.finishedAt) return
    const finishedAt = DateTime.fromSeconds(Number(workout.finishedAt.seconds))
    if (!finishedAt.isValid) return

    const start = finishedAt.startOf(unit)
    const key = start.toISODate()
    if (!key) return

    buckets.set(key, {
      label: start.setLocale(dateLocale()).toFormat(format),
      timestamp: start.toMillis(),
      volume: (buckets.get(key)?.volume ?? 0) + workout.intensity,
    })
  })

  return [...buckets.values()].sort((first, second) => first.timestamp - second.timestamp)
}

/**
 * The bars a range is drawn with, at the finest grain that still reads.
 *
 * A year of training is 52 bars in a phone-width card whether the athlete
 * trains daily or weekly — aggregating to weeks alone fixes only the first of
 * those. It walks day, week, month and takes the first that fits, so the shape
 * on screen is always one somebody can read.
 */
export const volumeSeries = (workouts: readonly Workout[]): VolumeSeries => {
  let series: VolumeSeries = { granularity: 'day', points: [] }

  for (const { granularity, unit, format } of grains) {
    series = { granularity, points: bucketedVolume(workouts, unit, format) }
    if (series.points.length <= maxBars) break
  }

  return series
}

/** The Progress screen's ranges, and the bars each is drawn with. */
const ranges = {
  '7D': { granularity: 'day', count: 7 },
  '4W': { granularity: 'week', count: 4 },
  '3M': { granularity: 'week', count: 13 },
  '1Y': { granularity: 'month', count: 12 },
} as const satisfies Record<string, { granularity: VolumeGranularity; count: number }>

export type VolumeRange = keyof typeof ranges

// Weeks are sevens counted back from today, so every one is whole and they
// compare fairly; months are the calendar's, since nobody reads a rolling one.
const steps = {
  day: { unit: 'days', size: 1, format: 'd LLL' },
  week: { unit: 'days', size: 7, format: 'd LLL' },
  month: { unit: 'months', size: 1, format: 'LLL yyyy' },
} as const

/** Where each of a range's buckets starts, oldest first, the last one holding today. */
const bucketStarts = (range: VolumeRange, now: DateTime): DateTime[] => {
  const { granularity, count } = ranges[range]
  const { unit, size } = steps[granularity]
  const last =
    granularity === 'month' ? now.startOf('month') : now.startOf('day').minus({ days: size - 1 })

  return Array.from({ length: count }, (_, index) =>
    last.minus({ [unit]: size * (count - 1 - index) }),
  )
}

const finishedAt = (workout: Workout): DateTime | undefined =>
  workout.finishedAt ? DateTime.fromSeconds(Number(workout.finishedAt.seconds)) : undefined

/** Workouts finished inside a range's buckets, in store order. */
export const withinRange = (
  workouts: readonly Workout[],
  range: VolumeRange,
  now: DateTime = DateTime.now(),
): Workout[] => {
  const [first] = bucketStarts(range, now)
  const end = now.endOf('day')

  return workouts.filter((workout) => {
    const finished = finishedAt(workout)
    return finished !== undefined && first !== undefined && finished >= first && finished <= end
  })
}

/**
 * A range's bars: every bucket from its start to today, oldest first.
 *
 * An empty bucket stays in at zero, so the bars are spaced by time rather than
 * by how often somebody trained.
 */
export const rangeSeries = (
  workouts: readonly Workout[],
  range: VolumeRange,
  now: DateTime = DateTime.now(),
): VolumeSeries => {
  const { granularity } = ranges[range]
  const starts = bucketStarts(range, now)
  const points = starts.map((start) => ({
    label: start.setLocale(dateLocale()).toFormat(steps[granularity].format),
    timestamp: start.toMillis(),
    volume: 0,
  }))

  withinRange(workouts, range, now).forEach((workout) => {
    const finished = finishedAt(workout)
    if (!finished) return
    const point = points[starts.filter((start) => start <= finished).length - 1]
    if (point) point.volume += workout.intensity
  })

  return { granularity, points }
}

/**
 * The volume of the period just before a range and as long as it, or
 * undefined for 1Y: the store fetches one year, so the year before is not there.
 */
export const priorVolume = (
  workouts: readonly Workout[],
  range: VolumeRange,
  now: DateTime = DateTime.now(),
): number | undefined => {
  const [first] = bucketStarts(range, now)
  if (range === '1Y' || !first) return undefined

  const { granularity, count } = ranges[range]
  const { unit, size } = steps[granularity]
  const start = first.minus({ [unit]: size * count })

  return totalVolume(
    workouts.filter((workout) => {
      const finished = finishedAt(workout)
      return finished !== undefined && finished >= start && finished < first
    }),
  )
}

/** The sum a range's bars add up to, shown as the card's headline figure. */
export const totalVolume = (workouts: readonly Workout[]): number =>
  workouts.reduce((total, workout) => total + workout.intensity, 0)
