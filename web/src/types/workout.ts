import type { Exercise } from '@/proto/api/v1/shared_pb'
import type { DistanceUnit, WeightUnit } from '@/proto/api/v1/shared_pb'

export type ExerciseID = string
type ExerciseSets = Record<ExerciseID, Set[]>

export type RoutineID = string
export type RoutineWorkout = Record<RoutineID, Workout>

export interface Set {
  reps?: number
  weight?: number
  distance?: number
  durationSeconds?: number
  weightUnit?: WeightUnit
  distanceUnit?: DistanceUnit
}

export interface Workout {
  addedExercises?: Exercise[]
  completedExerciseIds?: ExerciseID[]
  exerciseSets?: ExerciseSets
  // Minted once per session and sent with every attempt to save it, so a
  // save whose reply was lost is recognised by the server when it is sent
  // again rather than stored twice.
  idempotencyKey?: string
  note?: string
  planId?: string
  restTimerEndsAt?: string
  restTimerTotalSeconds?: number
  startedAt?: string
}
