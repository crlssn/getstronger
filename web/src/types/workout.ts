import type { Exercise } from '@/proto/api/v1/shared_pb'

export type ExerciseID = string
export type ExerciseSets = Record<ExerciseID, Set[]>

export type RoutineID = string
export type RoutineWorkout = Record<RoutineID, Workout>

export interface Set {
  reps?: number
  weight?: number
}

export interface Workout {
  addedExercises?: Exercise[]
  completedExerciseIds?: ExerciseID[]
  exerciseSets?: ExerciseSets
  note?: string
  startedAt?: string
}
