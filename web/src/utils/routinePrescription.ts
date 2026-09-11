import type { RoutineExercise } from '@/proto/api/v1/routine_service_pb'
import type { DistanceUnit } from '@/proto/api/v1/shared_pb'
import type { ExerciseTracking } from '@/utils/routineGroups'

import { formatDistanceIn, formatMeasurementDuration } from '@/utils/exerciseMeasurements'
import {
  defaultDistanceMeters,
  defaultHoldSeconds,
  defaultSets,
  trackingOf,
} from '@/utils/routineGroups'

/** Whatever holds a routine's prescription for one occurrence, saved or in hand. */
export interface Prescribed {
  tracking: ExerciseTracking
  sets: number
  restSeconds: number
  targetDurationSeconds: number
  targetDistanceMeters: number
}

/** What an occurrence prescribes, in the two halves a chip is built from. */
export interface Prescription {
  /** How the work is counted: "3 sets", "Timed", "Distance". */
  caption: string
  /** How much of it: the rest between sets, the hold, or the distance. */
  value: string
}

type Translate = (key: string, values?: Record<string, unknown>) => string

/**
 * The three ways an occurrence's work may be counted, as the segmented control
 * offers them. Asked in the same order and the same words wherever it is asked:
 * when the exercise is picked, and when its prescription is changed.
 */
export const trackingOptions = (t: Translate): { label: string; value: ExerciseTracking }[] => [
  { label: t('routine.form.blocks.sets'), value: 'sets' },
  { label: t('routine.form.blocks.timed'), value: 'timed' },
  { label: t('routine.form.blocks.distance'), value: 'distance' },
]

/**
 * One occurrence's prescription, said the same way wherever it is read: on the
 * row in the editor, and on the row in the routine it becomes.
 */
export const prescriptionOf = (
  entry: Prescribed,
  t: Translate,
  distanceUnit?: DistanceUnit,
): Prescription => {
  switch (entry.tracking) {
    case 'timed':
      return {
        caption: t('routine.form.blocks.timed'),
        value: formatMeasurementDuration(entry.targetDurationSeconds),
      }
    case 'distance':
      return {
        caption: t('routine.form.blocks.distance'),
        value: formatDistanceIn(entry.targetDistanceMeters / 1000, distanceUnit),
      }
    default:
      return {
        caption: t('routine.form.blocks.setsChip', { count: entry.sets }),
        value: entry.restSeconds
          ? t('routine.form.blocks.rest', {
              value: formatMeasurementDuration(entry.restSeconds),
            })
          : t('routine.form.blocks.noRest'),
      }
  }
}

/**
 * A saved occurrence read as a prescription. The values a routine saved before
 * it could prescribe never wrote fall back to what a new occurrence takes, so a
 * row reads as a prescription rather than as a row of zeros.
 */
export const prescribedFromRoutine = (entry: RoutineExercise): Prescribed => ({
  tracking: trackingOf(entry.tracking, entry.targetDurationSeconds),
  sets: entry.sets || defaultSets,
  restSeconds: entry.restSeconds,
  targetDurationSeconds: entry.targetDurationSeconds || defaultHoldSeconds,
  targetDistanceMeters: entry.targetDistanceMeters || defaultDistanceMeters,
})
