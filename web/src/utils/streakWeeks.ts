import { DateTime } from 'luxon'

/** The number of weeks the streak track shows at once. */
export const trackedWeeks = 5

export interface StreakWeek {
  /** How far back this block sits; 0 is the week in progress. */
  weeksAgo: number
  complete: boolean
  current: boolean
  workoutCount: number
  /** Capped for the block, which has room for two characters. */
  workoutCountDisplay: string
}

interface Streak {
  streak: number
  thisWeekLogged: boolean
  weekWorkoutCounts: Record<string, number>
}

/**
 * The five blocks of the streak track, oldest first.
 *
 * A week counts as complete when it is inside the streak. The week in progress
 * only joins once it has a workout in it, which is what keeps the track from
 * promising a streak the user has not earned yet.
 */
export const streakWeeks = (
  { streak, thisWeekLogged, weekWorkoutCounts }: Streak,
  now: DateTime = DateTime.now(),
): StreakWeek[] =>
  Array.from({ length: trackedWeeks }, (_, index) => {
    const weeksAgo = trackedWeeks - 1 - index
    const week = now.startOf('week').minus({ weeks: weeksAgo })
    const workoutCount = weekWorkoutCounts[`${week.weekYear}-${week.weekNumber}`] ?? 0

    return {
      weeksAgo,
      complete: thisWeekLogged ? weeksAgo < streak : weeksAgo > 0 && weeksAgo <= streak,
      current: weeksAgo === 0,
      workoutCount,
      workoutCountDisplay: workoutCount >= 9 ? '9+' : `${workoutCount}`,
    }
  })
