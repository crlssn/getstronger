import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { formatMoment, formatTimestamp } from '@/utils/datetime'
import { distanceInKilometers } from '@/utils/distanceUnits'

export interface WorkoutSummary {
  setCount: number
  personalBestCount: number
  /** Every unit the session trained in, zero where it did not. */
  totalReps: number
  totalDistanceKm: number
  totalSetSeconds: number
  /** Rounded to whole minutes, and never zero for a session that happened. */
  durationMinutes: number
  /** When it finished, in the form every row in the app uses. */
  finishedDate: string
  /** The same moment with its time of day, for the page about the session. */
  finishedMoment: string
}

export const workoutSummary = (workout: Workout): WorkoutSummary => {
  let setCount = 0
  let personalBestCount = 0
  let totalReps = 0
  let totalDistanceKm = 0
  let totalSetSeconds = 0

  for (const exercise of workout.exerciseSets) {
    setCount += exercise.sets.length
    for (const set of exercise.sets) {
      if (set.metadata?.personalBest) personalBestCount += 1
      totalReps += set.reps
      totalDistanceKm += distanceInKilometers(set.distance, set.distanceUnit)
      totalSetSeconds += set.durationSeconds
    }
  }

  const { startedAt, finishedAt } = workout

  return {
    setCount,
    personalBestCount,
    totalReps,
    totalDistanceKm,
    totalSetSeconds,
    // A workout that took under a minute still took some time; "0 min" reads
    // as missing data rather than as a short session.
    durationMinutes:
      startedAt && finishedAt
        ? Math.max(1, Math.round(Number(finishedAt.seconds - startedAt.seconds) / 60))
        : 0,
    finishedDate: formatTimestamp(finishedAt),
    finishedMoment: formatMoment(finishedAt),
  }
}
