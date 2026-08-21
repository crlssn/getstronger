import type { Set } from '@/proto/api/v1/shared_pb'

import { DateTime } from 'luxon'

import { dateLocale } from '@/i18n'
import { distanceInKilometers } from '@/utils/distanceUnits'
import { weightInKilograms } from '@/utils/weightUnits'

/** What the trend chart can plot; which of them apply is up to the exercise. */
export type TrendMetric = 'oneRm' | 'weight' | 'volume' | 'reps' | 'distance' | 'durationSeconds'

export type TrendDay = { label: string; timestamp: number } & Record<TrendMetric, number>

/** Epley, which is what a "estimated 1RM" means everywhere else in the app. */
export const estimateOneRepMax = (weight: number, reps: number) =>
  reps === 1 ? weight : weight * (1 + reps / 30)

/**
 * One point per calendar day, oldest first.
 *
 * Everything but volume is the day's best rather than its total, because the
 * question a trend answers is "how strong was I", not "how much did I do".
 * Weights and distances are converted first: sets logged years apart may have
 * been recorded under different unit preferences.
 */
export const trendByDay = (sets: readonly Set[]): TrendDay[] => {
  const days = new Map<string, TrendDay>()

  for (const set of sets) {
    const createdAt = set.metadata?.createdAt
    if (!createdAt) continue

    const date = DateTime.fromSeconds(Number(createdAt.seconds))
    if (!date.isValid) continue

    const key = date.toISODate()
    if (!key) continue

    const day = days.get(key) ?? {
      label: date.setLocale(dateLocale).toFormat('d LLL'),
      timestamp: date.toMillis(),
      oneRm: 0,
      weight: 0,
      volume: 0,
      reps: 0,
      distance: 0,
      durationSeconds: 0,
    }

    const weight = weightInKilograms(set.weight, set.weightUnit)
    day.oneRm = Math.max(day.oneRm, estimateOneRepMax(weight, set.reps))
    day.weight = Math.max(day.weight, weight)
    day.volume += weight * set.reps
    day.reps = Math.max(day.reps, set.reps)
    day.distance = Math.max(day.distance, distanceInKilometers(set.distance, set.distanceUnit))
    day.durationSeconds = Math.max(day.durationSeconds, set.durationSeconds)

    days.set(key, day)
  }

  return [...days.values()].sort((first, second) => first.timestamp - second.timestamp)
}

/** The whole-percent change from the first day plotted to the last. */
export const trendChange = (values: readonly number[]): number | undefined => {
  const [first] = values
  const last = values[values.length - 1]
  if (!first || last === undefined || values.length < 2) return undefined
  return Math.round(((last - first) / first) * 100)
}

/**
 * Thins a series down to at most `sampleSize` points, keeping the shape.
 *
 * A year of sets is thousands of points on a chart a few hundred pixels wide,
 * where every one past the first few hundred costs time and shows nothing.
 */
export const downSample = <T>(data: readonly T[], sampleSize: number): T[] => {
  if (data.length <= sampleSize) return [...data]

  const step = Math.ceil(data.length / sampleSize)
  const sampled: T[] = []
  for (let index = 0; index < data.length; index += step) sampled.push(data[index] as T)
  // The most recent point is the one the reader is looking for, and a fixed
  // step lands on it only when the length divides evenly.
  const last = data[data.length - 1] as T
  if (sampled[sampled.length - 1] !== last) sampled.push(last)
  return sampled
}
