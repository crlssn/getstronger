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
      label: finishedAt.setLocale(dateLocale).toFormat('d LLL'),
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
      label: start.setLocale(dateLocale).toFormat(format),
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

/** Workouts finished within the last `days` calendar days, in store order. */
export const withinDays = (
  workouts: readonly Workout[],
  days: number,
  now: DateTime = DateTime.now(),
): Workout[] => {
  const cutoff = now.minus({ days }).toMillis()
  return workouts.filter((workout) => {
    if (!workout.finishedAt) return false
    return DateTime.fromSeconds(Number(workout.finishedAt.seconds)).toMillis() >= cutoff
  })
}

/** The sum a range's bars add up to, shown as the card's headline figure. */
export const totalVolume = (workouts: readonly Workout[]): number =>
  workouts.reduce((total, workout) => total + workout.intensity, 0)
