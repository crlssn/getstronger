import { ref } from 'vue'
import { defineStore } from 'pinia'
import { DateTime } from 'luxon'

import type { Workout } from '@/proto/api/v1/workout_service_pb'

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'

// The chart's widest range; paging past it only fetches workouts no range shows.
export const chartRangeDays = 365
// A page of 100 (the API maximum) and eight pages bound a year of history at
// two workouts a day before the chart quietly truncates the oldest bars.
const chartPageLimit = 100
const maxPages = 8

// The progress chart's data feed. The dashboard's recentWorkouts is a
// three-item preview for the home screen, so charting a quarter or a year
// needs its own walk through the workout history.
export const useProgressStore = defineStore('progress', () => {
  const workouts = ref<Workout[]>([])
  const loaded = ref(false)
  const failed = ref(false)
  let inFlight: Promise<void> | undefined

  const refresh = async () => {
    const authStore = useAuthStore()
    if (!authStore.userId) return

    const cutoff = DateTime.now().minus({ days: chartRangeDays })
    const collected: Workout[] = []
    let pageToken: Uint8Array = new Uint8Array(0)
    let requestFailed = false

    for (let page = 0; page < maxPages; page += 1) {
      const response = await listWorkouts([authStore.userId], pageToken, chartPageLimit)
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

    failed.value = requestFailed
    if (!requestFailed) {
      workouts.value = collected
    }
    loaded.value = true
  }

  // Cached for the session; reset after saving a workout.
  const load = async () => {
    if (loaded.value && !failed.value) return
    if (!inFlight) {
      inFlight = refresh().finally(() => {
        inFlight = undefined
      })
    }
    return inFlight
  }

  const reset = () => {
    loaded.value = false
    failed.value = false
  }

  return {
    failed,
    load,
    loaded,
    reset,
    workouts,
  }
})
