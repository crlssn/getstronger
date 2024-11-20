export type RoutineID = string
export type ExerciseID = string

export type RoutineWorkout = Record<RoutineID, Workout>;
export type ExerciseSets = Record<ExerciseID, Set[]>;

export interface Workout {
  exerciseSets?: ExerciseSets
}

export interface Set {
  weight?: number
  reps?: number
}


