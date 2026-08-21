import { DateTime } from 'luxon'
import { create } from 'zustand'

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { singleFlight } from '@/utils/singleFlight'

// Anything older than the last bucket boundary groups the same way, so there is
// no reason to page back further than that.
const oldestRelevantDays = 31
const maxPages = 6

interface ActivityState {
  exerciseLastPerformed: Record<string, string>
  routineLastPerformed: Record<string, string>
  loaded: boolean
  failed: boolean
  load: () => Promise<void>
  reset: () => void
}

const parse = (iso: string | undefined) => {
  if (!iso) return undefined
  const parsed = DateTime.fromISO(iso)
  return parsed.isValid ? parsed : undefined
}

/**
 * One id's timestamp out of a last-performed record.
 *
 * Takes the record rather than the store so a component can subscribe to the
 * record itself: a lookup closed over the whole store changes identity on every
 * write, and anything memoised on it would recompute for unrelated reasons.
 */
export const lastPerformedIn = (record: Record<string, string>, id: string) => parse(record[id])

export const selectLastPerformedFor = (state: ActivityState, exerciseId: string) =>
  lastPerformedIn(state.exerciseLastPerformed, exerciseId)

export const selectRoutineLastPerformedFor = (state: ActivityState, routineId: string) =>
  lastPerformedIn(state.routineLastPerformed, routineId)

export const useActivityStore = create<ActivityState>()((set, get) => {
  const refresh = async () => {
    const { userId } = useAuthStore.getState()
    if (!userId) return

    const cutoff = DateTime.now().minus({ days: oldestRelevantDays })
    const performed: Record<string, string> = {}
    const routinesPerformed: Record<string, string> = {}
    let pageToken: Uint8Array = new Uint8Array(0)
    let requestFailed = false

    for (let page = 0; page < maxPages; page += 1) {
      const response = await listWorkouts([userId], pageToken)
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
          // Workouts arrive newest first, so the first hit is the latest.
          if (!performed[exerciseId]) performed[exerciseId] = finished.toISO() ?? ''
        }
      }

      pageToken = response.pagination?.nextPageToken ?? new Uint8Array(0)
      if (reachedCutoff || !pageToken.length) break
    }

    if (requestFailed) {
      set({ failed: true, loaded: true })
      return
    }

    set({
      failed: false,
      loaded: true,
      exerciseLastPerformed: performed,
      routineLastPerformed: routinesPerformed,
    })
  }

  const refreshOnce = singleFlight(refresh)

  return {
    exerciseLastPerformed: {},
    routineLastPerformed: {},
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
