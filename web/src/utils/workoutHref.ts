import { quickWorkoutRoutineID } from '@/stores/workout'

/**
 * Where a workout draft opens.
 *
 * A plan travels as a query parameter rather than in the path, so the routine
 * screen knows which plan to advance when the workout is saved.
 */
export const workoutHref = (routineID?: string, planID?: string): string => {
  if (!routineID) return '/workout'
  if (routineID === quickWorkoutRoutineID) return '/workouts/quick'

  return planID
    ? `/workouts/routine/${routineID}?plan_id=${encodeURIComponent(planID)}`
    : `/workouts/routine/${routineID}`
}
