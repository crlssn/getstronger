import { ExerciseMetric, type Exercise, type Set } from '@/proto/api/v1/shared_pb'
import { weightUnitLabel } from '@/utils/weightUnits'
import { distanceUnitLabel } from '@/utils/distanceUnits'
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

export const hasMeasurementValue = (set: Partial<Set>, field: MeasurementField) => {
  const value = set[field]
  return value !== undefined && value !== null
}

export const isMeasurementComplete = (set: Partial<Set>, field: MeasurementField) => {
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
  const { t } = i18n.global
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

export const formatSetPace = (set: Partial<Set>): string | undefined => {
  const distance = Number(set.distance ?? 0)
  const seconds = Number(set.durationSeconds ?? 0)
  if (!(distance > 0) || !(seconds > 0)) return undefined
  const secondsPerUnit = Math.round(seconds / distance)
  const minutes = Math.floor(secondsPerUnit / 60)
  const remainder = secondsPerUnit % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')} min/${distanceUnitLabel(set.distanceUnit)}`
}

const number = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)

export const formatExerciseSet = (set: Partial<Set>, exercise?: Pick<Exercise, 'metrics'>) => {
  const formatted = measurementsForExercise(exercise)
    .map(({ field }) => {
      const value = Number(set[field] ?? 0)
      switch (field) {
        case 'weight':
          return `${number(value)} ${weightUnitLabel(set.weightUnit)}`
        // The bare count: "92 kg · 3" — wherever this renders, the column
        // header or the unit-carrying value beside it already says reps.
        case 'reps':
          return number(value)
        case 'distance':
          return `${number(value)} ${distanceUnitLabel(set.distanceUnit)}`
        case 'durationSeconds':
          return formatDurationDisplay(value)
      }
    })
    .join(' · ')

  const pace = isDistanceTimeExercise(exercise) ? formatSetPace(set) : undefined
  return pace ? `${formatted} (${pace})` : formatted
}
