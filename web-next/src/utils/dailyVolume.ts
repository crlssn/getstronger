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
