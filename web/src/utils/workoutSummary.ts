import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { formatWorkoutDate } from '@/utils/datetime'

export interface WorkoutSummary {
  setCount: number
  personalBestCount: number
  /** Rounded to whole minutes, and never zero for a session that happened. */
  durationMinutes: number
  finishedDate: string
}

export const workoutSummary = (workout: Workout): WorkoutSummary => {
  let setCount = 0
  let personalBestCount = 0

  for (const exercise of workout.exerciseSets) {
    setCount += exercise.sets.length
    for (const set of exercise.sets) {
      if (set.metadata?.personalBest) personalBestCount += 1
    }
  }

  const { startedAt, finishedAt } = workout

  return {
    setCount,
    personalBestCount,
    // A workout that took under a minute still took some time; "0 min" reads
    // as missing data rather than as a short session.
    durationMinutes:
      startedAt && finishedAt
        ? Math.max(1, Math.round(Number(finishedAt.seconds - startedAt.seconds) / 60))
        : 0,
    finishedDate: formatWorkoutDate(finishedAt),
  }
}
