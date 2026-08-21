import type { Exercise } from '@/proto/api/v1/shared_pb'
import type { Set } from '@/types/workout'

import { hasAnyExerciseSetValue, isExerciseSetComplete } from '@/utils/exerciseMeasurements'

/** The rest a completed set starts when its exercise names no length of its own. */
export const defaultRestSeconds = 90

/** How much a "+30 sec" tap adds to a running rest. */
export const restExtensionSeconds = 30

/**
 * The session clock, as the header shows it.
 *
 * Under an hour it is m:ss so the shape stays familiar; past one it gains the
 * hours rather than counting to 90 minutes.
 */
export const elapsedLabel = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = (seconds % 60).toString().padStart(2, '0')

  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${remainder}`
  return `${minutes}:${remainder}`
}

export interface SessionExercise {
  exercise: Exercise
  sets: Set[]
}

/** Sets with everything their exercise measures filled in. */
export const loggedSetCount = (entries: readonly SessionExercise[]): number =>
  entries.reduce(
    (total, { exercise, sets }) =>
      total + sets.filter((set) => isExerciseSetComplete(set, exercise)).length,
    0,
  )

/** Sets somebody started and did not finish, which is what blocks a save. */
export const incompleteSetCount = (entries: readonly SessionExercise[]): number =>
  entries.reduce(
    (total, { exercise, sets }) =>
      total +
      sets.filter(
        (set) => hasAnyExerciseSetValue(set, exercise) && !isExerciseSetComplete(set, exercise),
      ).length,
    0,
  )

export type FinishBlocker =
  | { reason: 'loading' }
  | { reason: 'noExercises' }
  | { reason: 'partialSets'; count: number }
  | { reason: 'nothingLogged' }

/**
 * Why the session cannot be saved yet, or `undefined` when it can.
 *
 * An empty quick workout is not blocked by "no exercises": there is nothing to
 * fix, only something to add, and the screen says that in its own empty state.
 */
export const finishBlocker = (
  entries: readonly SessionExercise[] | undefined,
  quickWorkout: boolean,
): FinishBlocker | undefined => {
  if (!entries) return { reason: 'loading' }
  if (!entries.length) return quickWorkout ? undefined : { reason: 'noExercises' }

  const partial = incompleteSetCount(entries)
  if (partial > 0) return { reason: 'partialSets', count: partial }

  if (!loggedSetCount(entries)) return { reason: 'nothingLogged' }
  return undefined
}

/**
 * The set the user is about to log, which is the row that carries the emphasis.
 *
 * Returns -1 when every set is done, so nothing is highlighted on an exercise
 * that has been worked through.
 */
export const activeSetIndex = (sets: readonly Set[], exercise?: Exercise): number =>
  sets.findIndex((set) => !isExerciseSetComplete(set, exercise))

/**
 * The exercise to move to after completing the one at `from`.
 *
 * The next unfinished one below it, or failing that the first unfinished one
 * anywhere — so working out of order still lands somewhere useful. Returns -1
 * once everything is done.
 */
export const nextUnfinishedIndex = (
  exercises: readonly Exercise[],
  completed: Record<string, boolean>,
  from: number,
): number => {
  const below = exercises.findIndex((exercise, index) => index > from && !completed[exercise.id])
  if (below >= 0) return below

  return exercises.findIndex((exercise, index) => index !== from && !completed[exercise.id])
}
