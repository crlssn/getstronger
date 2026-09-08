import {
  DistanceUnit,
  ExerciseMetric,
  WeightUnit,
  type Exercise,
  type Set,
} from '@/proto/api/v1/shared_pb'
import { convertWeight, normalizeWeightUnit, weightUnitLabel } from '@/utils/weightUnits'
import {
  convertDistance,
  distanceUnitLabel,
  kilometersPerMile,
  normalizeDistanceUnit,
} from '@/utils/distanceUnits'
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

/**
 * A duration in the words a synthesiser should say, not the ones a screen shows.
 *
 * The circuit recorder speaks each phase as it starts, and "for one hundred and
 * twenty seconds" is a number the runner has to convert while running. The
 * abbreviations `formatDurationDisplay` uses are read aloud as badly as they
 * scan well, so this spells both units out and counts them.
 */
export const spokenDuration = (seconds: number): string => {
  const { t } = i18n
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  if (!minutes) return t('common.seconds', { count: remainder })
  if (!remainder) return t('common.minutes', { count: minutes })
  return `${t('common.minutes', { count: minutes })} ${t('common.seconds', { count: remainder })}`
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
const formatDistanceDisplay = (kilometers: number) =>
  kilometers < 1 ? `${formatNumber(kilometers * 1000)} m` : `${formatNumber(kilometers, 2)} km`

/** A figure and what it was measured in, for a caller that sets them apart. */
export interface Measured {
  value: string
  unit: string
}

/**
 * A kilogram figure in the unit the athlete reads in, kept in two parts.
 *
 * Trends are computed in kilograms whatever unit each set was logged in, so a
 * figure that leaves the trend for the screen goes through here.
 */
export const weightIn = (kilograms: number, unit?: WeightUnit): Measured => {
  const preferred = normalizeWeightUnit(unit)
  return {
    value: formatNumber(convertWeight(kilograms, WeightUnit.KILOGRAMS, preferred)),
    unit: weightUnitLabel(preferred),
  }
}

/**
 * A stored kilometre total in the unit the athlete reads in, kept in two parts.
 *
 * Distances are stored and sent in kilometres whatever unit the set was entered
 * in, so every total shown outside a set's own row goes through here.
 */
/**
 * A distance in the athlete's unit, to two decimals unless told otherwise.
 *
 * `fixedDigits` is for a number being watched rather than read: it keeps every
 * decimal, so a live total ticks up with each fix instead of turning over
 * once every ten metres, and it holds its width while it does.
 */
export const distanceIn = (
  kilometers: number,
  unit?: DistanceUnit,
  fixedDigits?: number,
): Measured => {
  const preferred = normalizeDistanceUnit(unit)
  const digits = fixedDigits ?? 2
  // Metres are a sub-unit of ground covered, not of none: a week with nothing
  // in it reads "0 km", where "0 m" reads as a distance somebody measured.
  if (preferred === DistanceUnit.KILOMETERS && kilometers > 0 && kilometers < 1) {
    return { value: formatNumber(kilometers * 1000), unit: 'm' }
  }
  if (preferred === DistanceUnit.KILOMETERS && kilometers > 0) {
    return { value: formatNumber(kilometers, digits, fixedDigits), unit: 'km' }
  }

  const distance = convertDistance(kilometers, DistanceUnit.KILOMETERS, preferred)
  return {
    value: formatNumber(distance, digits, fixedDigits),
    unit: distanceUnitLabel(preferred),
  }
}

export const formatDistanceIn = (kilometers: number, unit?: DistanceUnit) => {
  const { value, unit: label } = distanceIn(kilometers, unit)
  return `${value} ${label}`
}

/**
 * Pace kept apart from its unit — "5:00" and "/km" — in the athlete's unit.
 *
 * The two are set in different registers wherever a figure is the point of the
 * screen, which a caller handed one string cannot do. A distance shown in
 * miles beside a pace per kilometre is two answers to the same question, so
 * the unit follows the athlete's rather than the storage unit.
 */
export const paceIn = (secondsPerKilometer: number, unit?: DistanceUnit): Measured => {
  const preferred = normalizeDistanceUnit(unit)
  const perUnit = Math.round(
    preferred === DistanceUnit.MILES
      ? secondsPerKilometer * kilometersPerMile
      : secondsPerKilometer,
  )
  const minutes = Math.floor(perUnit / 60)
  const seconds = perUnit % 60
  return {
    value: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    unit: `/${distanceUnitLabel(preferred)}`,
  }
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
