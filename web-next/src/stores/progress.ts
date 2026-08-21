import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { DateTime } from 'luxon'
import { create } from 'zustand'

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { singleFlight } from '@/utils/singleFlight'

// The chart's widest range; paging past it only fetches workouts no range shows.
export const chartRangeDays = 365
// A page of 100 (the API maximum) and eight pages bound a year of history at
// two workouts a day before the chart quietly truncates the oldest bars.
const chartPageLimit = 100
const maxPages = 8

interface ProgressState {
  workouts: Workout[]
  loaded: boolean
  failed: boolean
  load: () => Promise<void>
  reset: () => void
}

// The progress chart's data feed. The dashboard's recentWorkouts is a
// three-item preview for the home screen, so charting a quarter or a year
// needs its own walk through the workout history.
export const useProgressStore = create<ProgressState>()((set, get) => {
  const refresh = async () => {
    const { userId } = useAuthStore.getState()
    if (!userId) return

    const cutoff = DateTime.now().minus({ days: chartRangeDays })
    const collected: Workout[] = []
    let pageToken: Uint8Array = new Uint8Array(0)
    let requestFailed = false

    for (let page = 0; page < maxPages; page += 1) {
      const response = await listWorkouts([userId], pageToken, chartPageLimit)
      if (!response) {
        requestFailed = true
        break
      }

      let reachedCutoff = false
      for (const workout of response.workouts) {
        if (!workout.finishedAt) continue
        const finished = DateTime.fromSeconds(Number(workout.finishedAt.seconds))
        if (finished < cutoff) {
          // Workouts arrive newest first, so everything after this is older
          // than the widest range.
          reachedCutoff = true
          break
        }
        collected.push(workout)
      }

      pageToken = response.pagination?.nextPageToken ?? new Uint8Array(0)
      if (reachedCutoff || !pageToken.length) break
    }

    if (requestFailed) {
      set({ failed: true, loaded: true })
      return
    }

    set({ failed: false, loaded: true, workouts: collected })
  }

  const refreshOnce = singleFlight(refresh)

  return {
    workouts: [],
    loaded: false,
    failed: false,

    // Cached for the session; reset after saving a workout.
    load: async () => {
      if (get().loaded && !get().failed) return
      await refreshOnce()
    },

    reset: () => set({ loaded: false, failed: false }),
  }
})
