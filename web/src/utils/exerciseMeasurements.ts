import { DistanceUnit, ExerciseMetric, type Exercise, type Set } from '@/proto/api/v1/shared_pb'
import { weightUnitLabel } from '@/utils/weightUnits'
import { convertDistance, distanceUnitLabel, normalizeDistanceUnit } from '@/utils/distanceUnits'
import { formatNumber } from '@/utils/numbers'
import { i18n } from '@/i18n'

export type MeasurementField = 'weight' | 'reps' | 'distance' | 'durationSeconds'

export const measurementDefinitions = [
  {
    metric: ExerciseMetric.WEIGHT,
    field: 'weight',
    labelKey: 'common.weight',
    inputmode: 'decimal',
  },
  { metric: ExerciseMetric.REPS, field: 'reps', labelKey: 'common.reps', inputmode: 'numeric' },
  {
    metric: ExerciseMetric.DISTANCE,
    field: 'distance',
    labelKey: 'common.distance',
    inputmode: 'decimal',
  },
  {
    metric: ExerciseMetric.TIME,
    field: 'durationSeconds',
    labelKey: 'common.time',
    inputmode: 'numeric',
  },
] as const

export const exerciseMetrics = (exercise?: Pick<Exercise, 'metrics'>) =>
  exercise?.metrics.length ? exercise.metrics : [ExerciseMetric.WEIGHT, ExerciseMetric.REPS]

export const measurementsForExercise = (exercise?: Pick<Exercise, 'metrics'>) => {
  const selected = new Set(exerciseMetrics(exercise))
  return measurementDefinitions.filter(({ metric }) => selected.has(metric))
}

const hasMeasurementValue = (set: Partial<Set>, field: MeasurementField) => {
  const value = set[field]
  return value !== undefined && value !== null
}

const isMeasurementComplete = (set: Partial<Set>, field: MeasurementField) => {
  const value = Number(set[field])
  if (!Number.isFinite(value)) return false
  if (field === 'weight') return value >= 0
  return value > 0 && ((field !== 'reps' && field !== 'durationSeconds') || Number.isInteger(value))
}

export const isExerciseSetComplete = (set: Partial<Set>, exercise?: Pick<Exercise, 'metrics'>) =>
  measurementsForExercise(exercise).every(({ field }) => isMeasurementComplete(set, field))

export const hasAnyExerciseSetValue = (set: Partial<Set>, exercise?: Pick<Exercise, 'metrics'>) =>
  measurementsForExercise(exercise).some(({ field }) => hasMeasurementValue(set, field))

// The m:ss form is the *input* format: DurationInput parses it back, so it
// must stay round-trippable. Read-only views use formatDurationDisplay.
export const formatMeasurementDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

export const formatDurationDisplay = (seconds: number) => {
  const { t } = i18n
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  if (!minutes) return `${remainder} ${t('common.sec')}`
  if (!remainder) return `${minutes} ${t('common.min')}`
  return `${minutes} ${t('common.min')} ${remainder} ${t('common.sec')}`
}

// Pace only makes sense for exercises measured as distance × time alone; a
// swim with reps (intervals) or any other combination has no single speed.
export const isDistanceTimeExercise = (exercise?: Pick<Exercise, 'metrics'>) => {
  const metrics = exerciseMetrics(exercise)
  return (
    metrics.length === 2 &&
    metrics.includes(ExerciseMetric.DISTANCE) &&
    metrics.includes(ExerciseMetric.TIME)
  )
}

// A stored kilometre value under one reads better in metres: "744 m", where
// "0.74 km" makes the reader do the conversion.
export const formatDistanceDisplay = (kilometers: number) =>
  kilometers < 1 ? `${formatNumber(kilometers * 1000)} m` : `${formatNumber(kilometers, 2)} km`

/**
 * A stored kilometre total in the unit the athlete reads in. Distances are
 * stored and sent in kilometres whatever unit the set was entered in, so every
 * total shown outside a set's own row goes through here.
 */
export const formatDistanceIn = (kilometers: number, unit?: DistanceUnit) => {
  const preferred = normalizeDistanceUnit(unit)
  // Metres are a sub-unit of ground covered, not of none: a week with nothing
  // in it reads "0 km", where "0 m" reads as a distance somebody measured.
  if (preferred === DistanceUnit.KILOMETERS && kilometers > 0) {
    return formatDistanceDisplay(kilometers)
  }

  const distance = convertDistance(kilometers, DistanceUnit.KILOMETERS, preferred)
  return `${formatNumber(distance, 2)} ${distanceUnitLabel(preferred)}`
}

/** Pace the way runners say it: "5:24 min/km", from seconds per kilometre. */
export const formatPaceDisplay = (secondsPerKilometer: number) => {
  const rounded = Math.round(secondsPerKilometer)
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')} min/km`
}

export const formatSetPace = (set: Partial<Set>): string | undefined => {
  const distance = Number(set.distance ?? 0)
  const seconds = Number(set.durationSeconds ?? 0)
  if (!(distance > 0) || !(seconds > 0)) return undefined
  const secondsPerUnit = Math.round(seconds / distance)
  const minutes = Math.floor(secondsPerUnit / 60)
  const remainder = secondsPerUnit % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')} min/${distanceUnitLabel(set.distanceUnit)}`
}

const number = (value: number) => formatNumber(value, 2)

export const formatExerciseSet = (set: Partial<Set>, exercise?: Pick<Exercise, 'metrics'>) => {
  const measurements = measurementsForExercise(exercise).map(({ field }) => {
    const value = Number(set[field] ?? 0)
    switch (field) {
      case 'weight':
        return { field, text: `${number(value)} ${weightUnitLabel(set.weightUnit)}` }
      // The bare count: "92 kg × 7" — the unit-carrying weight before it
      // says what the count multiplies.
      case 'reps':
        return { field, text: number(value) }
      // Kilometres switch to metres below one; miles have no such sub-unit.
      case 'distance':
        return {
          field,
          text:
            normalizeDistanceUnit(set.distanceUnit) === DistanceUnit.KILOMETERS
              ? formatDistanceDisplay(value)
              : `${number(value)} ${distanceUnitLabel(set.distanceUnit)}`,
        }
      case 'durationSeconds':
        return { field, text: formatDurationDisplay(value) }
    }
  })

  // Weight meets reps with the multiplication sign; every other seam between
  // two facts stays a middle dot. The pair is adjacent by definition order.
  const formatted = measurements.reduce((joined, { field }, index) => {
    if (!index) return measurements[0].text
    const separator = field === 'reps' && measurements[index - 1].field === 'weight' ? ' × ' : ' · '
    return `${joined}${separator}${measurements[index].text}`
  }, '')

  const pace = isDistanceTimeExercise(exercise) ? formatSetPace(set) : undefined
  return pace ? `${formatted} (${pace})` : formatted
}
