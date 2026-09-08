import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { DateTime } from 'luxon'

import { dateLocale } from '@/i18n'

export interface WorkoutMonth {
  /** The month's first day, so a card keeps its identity across renders. */
  key: string
  /**
   * The month in the reader's language, unset for the undated group.
   *
   * The year is dropped while it is the current one, as every other date in
   * the app drops it: a heading saying 2026 in 2026 is noise.
   */
  label?: string
  /** Newest first, as the list itself reads. */
  workouts: Workout[]
  /** What the month lifted: the sessions' intensity, and zero where none did. */
  volume: number
}

const undatedKey = 'undated'

/**
 * Groups finished sessions into the months they were trained in, newest first.
 *
 * A history is otherwise an unbroken list of rows with no landmarks in it. The
 * whole list is grouped again on every render rather than a page at a time,
 * which is what keeps a month whole when its older sessions arrive on the next
 * page.
 *
 * A workout the server sent without a finish time cannot be dated; those
 * gather in a final group with no label, so a history never loses a session to
 * a missing timestamp.
 */
export const groupWorkoutsByMonth = (
  workouts: readonly Workout[],
  now: DateTime = DateTime.now(),
): WorkoutMonth[] => {
  const months = new Map<string, WorkoutMonth & { timestamp: number }>()

  for (const workout of workouts) {
    const finishedAt = workout.finishedAt
      ? DateTime.fromSeconds(Number(workout.finishedAt.seconds))
      : undefined
    const start = finishedAt?.isValid ? finishedAt.startOf('month') : undefined
    const key = start?.toISODate() ?? undatedKey

    const month = months.get(key) ?? {
      key,
      label: start
        ?.setLocale(dateLocale())
        .toFormat(start.year === now.year ? 'LLLL' : 'LLLL yyyy'),
      workouts: [],
      volume: 0,
      // An undated session sorts last, whatever the dated ones are.
      timestamp: start?.toMillis() ?? -Infinity,
    }

    month.workouts.push(workout)
    month.volume += workout.intensity
    months.set(key, month)
  }

  const finishedAtOf = (workout: Workout) => Number(workout.finishedAt?.seconds ?? 0)

  return [...months.values()]
    .sort((first, second) => second.timestamp - first.timestamp)
    .map(({ timestamp: _timestamp, ...month }) => ({
      ...month,
      workouts: month.workouts.sort((first, second) => finishedAtOf(second) - finishedAtOf(first)),
    }))
}
