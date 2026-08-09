import { ref } from 'vue'
import { defineStore } from 'pinia'
import { DateTime } from 'luxon'

import { listWorkouts } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'

const maxPages = 12

const weekKey = (dateTime: DateTime) => `${dateTime.weekYear}-${dateTime.weekNumber}`

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

export const useStreakStore = defineStore('streak', () => {
  const streak = ref(0)
  const thisWeekLogged = ref(false)
  const loaded = ref(false)
  const failed = ref(false)
  const computedForWeek = ref('')
  let inFlight: Promise<void> | undefined

  const refresh = async (currentWeek: string) => {
    const authStore = useAuthStore()
    if (!authStore.userId) return

    const weeks = new Set<string>()
    let oldestWeek: DateTime | undefined
    let pageToken: Uint8Array = new Uint8Array(0)
    let requestFailed = false

    for (let page = 0; page < maxPages; page += 1) {
      const response = await listWorkouts([authStore.userId], pageToken)
      if (!response) {
        requestFailed = true
        break
      }

      for (const workout of response.workouts) {
        if (!workout.finishedAt) continue
        const finished = DateTime.fromSeconds(Number(workout.finishedAt.seconds)).startOf('week')
        weeks.add(weekKey(finished))
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
    failed.value = requestFailed
    if (requestFailed) {
      loaded.value = true
      return
    }

    streak.value = computeStreak(weeks).count
    thisWeekLogged.value = weeks.has(currentWeek)
    computedForWeek.value = currentWeek
    loaded.value = true
  }

  // Cached for the session: recomputed only when the week rolls over, after a
  // workout is saved (see reset), or when a previous attempt failed.
  const load = async () => {
    const currentWeek = weekKey(DateTime.now().startOf('week'))
    if (loaded.value && !failed.value && computedForWeek.value === currentWeek) return
    if (!inFlight) {
      inFlight = refresh(currentWeek).finally(() => {
        inFlight = undefined
      })
    }
    return inFlight
  }

  const reset = () => {
    computedForWeek.value = ''
    loaded.value = false
    failed.value = false
  }

  return { computedForWeek, failed, load, loaded, reset, streak, thisWeekLogged }
})
