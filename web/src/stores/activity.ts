import { ref } from 'vue'
import { defineStore } from 'pinia'
import { DateTime } from 'luxon'

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'

// Anything older than the last bucket boundary groups the same way, so there is
// no reason to page back further than that.
const oldestRelevantDays = 31
const maxPages = 6

export const useActivityStore = defineStore('activity', () => {
  const exerciseLastPerformed = ref<Record<string, string>>({})
  const routineLastPerformed = ref<Record<string, string>>({})
  const loaded = ref(false)
  const failed = ref(false)
  let inFlight: Promise<void> | undefined

  const parse = (iso: string | undefined) => {
    if (!iso) return undefined
    const parsed = DateTime.fromISO(iso)
    return parsed.isValid ? parsed : undefined
  }

  const lastPerformedFor = (exerciseId: string) => parse(exerciseLastPerformed.value[exerciseId])
  const routineLastPerformedFor = (routineId: string) =>
    parse(routineLastPerformed.value[routineId])

  const refresh = async () => {
    const authStore = useAuthStore()
    if (!authStore.userId) return

    const cutoff = DateTime.now().minus({ days: oldestRelevantDays })
    const performed: Record<string, string> = {}
    const routinesPerformed: Record<string, string> = {}
    let pageToken: Uint8Array = new Uint8Array(0)
    let requestFailed = false

    for (let page = 0; page < maxPages; page += 1) {
      const response = await listWorkouts([authStore.userId], pageToken)
      if (!response) {
        requestFailed = true
        break
      }

      let reachedCutoff = false
      for (const workout of response.workouts) {
        if (!workout.finishedAt) continue
        const finished = DateTime.fromSeconds(Number(workout.finishedAt.seconds))
        if (finished < cutoff) reachedCutoff = true

        // Empty for quick workouts and for anything logged before routines
        // were linked to workouts.
        if (workout.routineId && !routinesPerformed[workout.routineId]) {
          routinesPerformed[workout.routineId] = finished.toISO() ?? ''
        }

        for (const exerciseSets of workout.exerciseSets) {
          const exerciseId = exerciseSets.exercise?.id
          if (!exerciseId) continue
          const existing = performed[exerciseId]
          // Workouts arrive newest first, so the first hit is the latest.
          if (!existing) performed[exerciseId] = finished.toISO() ?? ''
        }
      }

      pageToken = response.pagination?.nextPageToken ?? new Uint8Array(0)
      if (reachedCutoff || !pageToken.length) break
    }

    failed.value = requestFailed
    if (!requestFailed) {
      exerciseLastPerformed.value = performed
      routineLastPerformed.value = routinesPerformed
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
    exerciseLastPerformed,
    failed,
    lastPerformedFor,
    load,
    loaded,
    reset,
    routineLastPerformed,
    routineLastPerformedFor,
  }
})
