import { DateTime } from 'luxon'
import { describe, expect, test } from 'vitest'

import { streakWeeks, trackedWeeks } from './streakWeeks'

const now = DateTime.fromISO('2026-08-14T00:00:00Z')

const weekKeyAgo = (weeksAgo: number) => {
  const week = now.startOf('week').minus({ weeks: weeksAgo })
  return `${week.weekYear}-${week.weekNumber}`
}

const weeks = (streak: number, thisWeekLogged: boolean, counts: Record<string, number> = {}) =>
  streakWeeks({ streak, thisWeekLogged, weekWorkoutCounts: counts }, now)

describe('streakWeeks', () => {
  test('runs oldest first and ends on the week in progress', () => {
    const track = weeks(0, false)

    expect(track).toHaveLength(trackedWeeks)
    expect(track.map((week) => week.weeksAgo)).toEqual([7, 6, 5, 4, 3, 2, 1, 0])
    expect(track.at(-1)?.current).toBe(true)
  })

  // The week in progress joins the streak only once it has a workout in it, so
  // the track never promises a streak the user has not earned yet.
  test('leaves the week in progress incomplete until it is logged', () => {
    expect(weeks(2, false).at(-1)?.complete).toBe(false)
    expect(weeks(2, true).at(-1)?.complete).toBe(true)
  })

  test('fills exactly as many past weeks as the streak covers', () => {
    expect(weeks(2, false).map((week) => week.complete)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
    ])
    expect(weeks(2, true).map((week) => week.complete)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ])
  })

  test('counts the workouts logged in each week', () => {
    const track = weeks(1, true, { [weekKeyAgo(0)]: 3 })

    expect(track.at(-1)?.workoutCount).toBe(3)
    expect(track.at(-2)?.workoutCount).toBe(0)
  })
})
