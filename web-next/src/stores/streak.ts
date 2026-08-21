import { DateTime } from 'luxon'
import { create } from 'zustand'

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { singleFlight } from '@/utils/singleFlight'

const maxPages = 12

const weekKey = (dateTime: DateTime) => `${dateTime.weekYear}-${dateTime.weekNumber}`

export const currentWeekKey = () => weekKey(DateTime.now().startOf('week'))

const computeStreak = (weeks: Set<string>) => {
  let count = 0
  let cursor = DateTime.now().startOf('week')
  if (!weeks.has(weekKey(cursor))) cursor = cursor.minus({ weeks: 1 })
  while (weeks.has(weekKey(cursor))) {
    count += 1
    cursor = cursor.minus({ weeks: 1 })
  }
  // cursor now points at the first week without a workout.
  return { count, firstMissingWeek: cursor }
}

interface StreakState {
  streak: number
  thisWeekLogged: boolean
  weekWorkoutCounts: Record<string, number>
  loaded: boolean
  failed: boolean
  computedForWeek: string
  load: () => Promise<void>
  reset: () => void
}

export const useStreakStore = create<StreakState>()((set, get) => {
  const refresh = async (currentWeek: string) => {
    const { userId } = useAuthStore.getState()
    if (!userId) return

    const weeks = new Set<string>()
    const workoutCounts = new Map<string, number>()
    let oldestWeek: DateTime | undefined
    let pageToken: Uint8Array = new Uint8Array(0)
    let requestFailed = false

    for (let page = 0; page < maxPages; page += 1) {
      const response = await listWorkouts([userId], pageToken)
      if (!response) {
        requestFailed = true
        break
      }

      for (const workout of response.workouts) {
        if (!workout.finishedAt) continue
        const finished = DateTime.fromSeconds(Number(workout.finishedAt.seconds)).startOf('week')
        const finishedWeek = weekKey(finished)
        weeks.add(finishedWeek)
        workoutCounts.set(finishedWeek, (workoutCounts.get(finishedWeek) ?? 0) + 1)
        if (!oldestWeek || finished < oldestWeek) oldestWeek = finished
      }

      pageToken = response.pagination?.nextPageToken ?? new Uint8Array(0)
      if (!pageToken.length) break

      // Stop once the streak already breaks inside the fetched range: older
      // pages cannot change the outcome.
      const { firstMissingWeek } = computeStreak(weeks)
      if (oldestWeek && firstMissingWeek >= oldestWeek) break
    }

    // A partial fetch would understate the streak, so surface it as an error
    // rather than reporting a confident zero.
    if (requestFailed) {
      set({ failed: true, loaded: true })
      return
    }

    set({
      failed: false,
      loaded: true,
      streak: computeStreak(weeks).count,
      thisWeekLogged: weeks.has(currentWeek),
      weekWorkoutCounts: Object.fromEntries(workoutCounts),
      computedForWeek: currentWeek,
    })
  }

  // The week is read at call time rather than passed in, so a tab left open
  // across midnight on Sunday recomputes instead of holding last week's count.
  const refreshOnce = singleFlight(() => refresh(currentWeekKey()))

  return {
    streak: 0,
    thisWeekLogged: false,
    weekWorkoutCounts: {},
    loaded: false,
    failed: false,
    computedForWeek: '',

    // Cached for the session: recomputed only when the week rolls over, after
    // a workout is saved (see reset), or when a previous attempt failed.
    load: async () => {
      const { loaded, failed, computedForWeek } = get()
      if (loaded && !failed && computedForWeek === currentWeekKey()) return
      await refreshOnce()
    },

    reset: () => set({ computedForWeek: '', loaded: false, failed: false }),
  }
})
