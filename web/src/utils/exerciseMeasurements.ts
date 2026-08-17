import { ExerciseMetric, type Exercise, type Set } from '@/proto/api/v1/shared_pb'
import { weightUnitLabel } from '@/utils/weightUnits'
import { distanceUnitLabel } from '@/utils/distanceUnits'

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

export const formatMeasurementDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

const number = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)

export const formatExerciseSet = (set: Partial<Set>, exercise?: Pick<Exercise, 'metrics'>) =>
  measurementsForExercise(exercise)
    .map(({ field }) => {
      const value = Number(set[field] ?? 0)
      switch (field) {
        case 'weight':
          return `${number(value)} ${weightUnitLabel(set.weightUnit)}`
        case 'reps':
          return `${number(value)} reps`
        case 'distance':
          return `${number(value)} ${distanceUnitLabel(set.distanceUnit)}`
        case 'durationSeconds':
          return formatMeasurementDuration(value)
      }
    })
    .join(' · ')
