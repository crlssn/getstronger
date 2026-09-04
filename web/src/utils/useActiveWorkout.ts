import type { Workout } from '@/types/workout'

import { i18n } from '@/i18n'
import { useDashboardStore } from '@/stores/dashboard'
import { quickWorkoutRoutineID, useWorkoutStore } from '@/stores/workout'

const hasEnteredValue = (value: unknown) =>
  value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0)

// A workout starts at its first logged value, so that is also what makes one
// resumable: a routine opened, an exercise picked or a note typed is
// preparation, and the tab bar has no session to offer back yet.
const hasLoggedSet = (workout: Workout) =>
  Object.values(workout.exerciseSets ?? {}).some((sets) =>
    sets.some(
      (set) =>
        hasEnteredValue(set.weight) ||
        hasEnteredValue(set.reps) ||
        hasEnteredValue(set.distance) ||
        hasEnteredValue(set.durationSeconds),
    ),
  )

type SavedWorkout = [routineId: string, workout: Workout] | undefined

/** The most recently started workout that has something logged in it. */
const selectSavedWorkout = (workouts: Record<string, Workout>): SavedWorkout =>
  Object.entries(workouts)
    .filter(([, workout]) => workout.startedAt && hasLoggedSet(workout))
    .sort(([, a], [, b]) => Date.parse(b.startedAt ?? '') - Date.parse(a.startedAt ?? ''))[0]

/**
 * Where the workout tab goes.
 *
 * A plan travels as a query parameter rather than in the path, so the routine
 * screen knows which plan to advance when the workout is saved.
 */
const savedWorkoutHref = (saved: SavedWorkout): string => {
  const routineId = saved?.[0]
  if (!routineId) return '/workout'
  if (routineId === quickWorkoutRoutineID) return '/workouts/quick'

  const planId = saved[1].planId
  return planId
    ? `/workouts/routine/${routineId}?plan_id=${encodeURIComponent(planId)}`
    : `/workouts/routine/${routineId}`
}

const millisecondsOf = (iso: string | undefined) => {
  const time = Date.parse(iso ?? '')
  return Number.isNaN(time) ? undefined : time
}

/** Shared view of the locally persisted in-progress workout. */
export const useActiveWorkout = () => {
  const workouts = useWorkoutStore((state) => state.workouts)
  const routines = useDashboardStore((state) => state.dashboard?.routines)

  const savedWorkout = selectSavedWorkout(workouts)
  const routineId = savedWorkout?.[0]

  const savedRoutineName = !routineId
    ? i18n.t('workout.inProgress')
    : routineId === quickWorkoutRoutineID
      ? i18n.t('workout.quick')
      : (routines?.find((routine) => routine.id === routineId)?.name ??
        i18n.t('workout.inProgress'))

  return {
    savedWorkout,
    savedHref: savedWorkoutHref(savedWorkout),
    savedRoutineName,
    savedWorkoutStartedAtMs: millisecondsOf(savedWorkout?.[1].startedAt),
    savedRestTimerEndsAtMs: millisecondsOf(savedWorkout?.[1].restTimerEndsAt),
  }
}
