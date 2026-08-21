import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { DateTime } from 'luxon'

import { dateLocale } from '@/i18n'

export interface WorkoutSummary {
  setCount: number
  personalBestCount: number
  /** Rounded to whole minutes, and never zero for a session that happened. */
  durationMinutes: number
  /** The day it finished, formatted; empty for a workout that never finished. */
  finishedDay: string
  /** The catalogue key to show instead of `finishedDay`, when the day has a name. */
  finishedDayKey?: string
  /** The clock time it finished; empty for a workout that never finished. */
  finishedTime: string
}

// Only the two days a reader places instantly get a name. "Three days ago" is
// harder work than the date it stands for, so the date wins from there on.
const namedDayKey = (day: DateTime, now: DateTime): string | undefined => {
  const daysAgo = now.startOf('day').diff(day.startOf('day'), 'days').days

  // A finish time slightly ahead of the clock is skew, not the future.
  if (daysAgo <= 0) return 'activity.today'
  if (daysAgo === 1) return 'activity.yesterday'
  return undefined
}

export const workoutSummary = (
  workout: Workout,
  now: DateTime = DateTime.now(),
): WorkoutSummary => {
  let setCount = 0
  let personalBestCount = 0

  for (const exercise of workout.exerciseSets) {
    setCount += exercise.sets.length
    for (const set of exercise.sets) {
      if (set.metadata?.personalBest) personalBestCount += 1
    }
  }

  const { startedAt, finishedAt } = workout
  const finished = finishedAt
    ? DateTime.fromSeconds(Number(finishedAt.seconds)).setLocale(dateLocale)
    : undefined

  return {
    setCount,
    personalBestCount,
    // A workout that took under a minute still took some time; "0 min" reads
    // as missing data rather than as a short session.
    durationMinutes:
      startedAt && finishedAt
        ? Math.max(1, Math.round(Number(finishedAt.seconds - startedAt.seconds) / 60))
        : 0,
    // The year is only worth its width once it stops being the current one.
    finishedDay: finished
      ? finished.toFormat(finished.year === now.year ? 'd LLLL' : 'd LLLL yyyy')
      : '',
    finishedDayKey: finished ? namedDayKey(finished, now) : undefined,
    finishedTime: finished ? finished.toFormat('HH:mm') : '',
  }
}
