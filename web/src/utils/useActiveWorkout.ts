import { computed } from 'vue'
import { DateTime } from 'luxon'

import { useDashboardStore } from '@/stores/dashboard'
import { useWorkoutStore } from '@/stores/workout'

// Shared view of the locally persisted in-progress workout.
export default function useActiveWorkout() {
  const workoutStore = useWorkoutStore()
  const dashboardStore = useDashboardStore()

  const savedWorkout = computed(
    () =>
      Object.entries(workoutStore.workouts)
        .filter(([, workout]) => workout.startedAt)
        .sort(([, a], [, b]) => Date.parse(b.startedAt ?? '') - Date.parse(a.startedAt ?? ''))[0],
  )

  const savedHref = computed(() => {
    const routineId = savedWorkout.value?.[0]
    if (!routineId) return '/workout'
    if (routineId === 'quick-workout') return '/workouts/quick'
    const planId = savedWorkout.value?.[1].planId
    return planId
      ? { path: `/workouts/routine/${routineId}`, query: { plan_id: planId } }
      : `/workouts/routine/${routineId}`
  })

  const savedRoutineName = computed(() => {
    const routineId = savedWorkout.value?.[0]
    if (!routineId) return 'Workout in progress'
    if (routineId === 'quick-workout') return 'Quick Workout'
    return (
      dashboardStore.dashboard?.routines.find((routine) => routine.id === routineId)?.name ??
      'Workout in progress'
    )
  })

  const savedWorkoutStarted = computed(() => {
    const startedAt = savedWorkout.value?.[1].startedAt
    if (!startedAt) return 'Workout in progress'
    const start = DateTime.fromISO(startedAt)
    return start.isValid ? `Started ${start.toRelative()}` : 'Workout in progress'
  })

  const savedWorkoutStartedAtMs = computed(() => {
    const time = Date.parse(savedWorkout.value?.[1].startedAt ?? '')
    return Number.isNaN(time) ? undefined : time
  })

  const discardSavedWorkout = () => {
    const routineId = savedWorkout.value?.[0]
    if (!routineId) return
    if (!confirm(`Discard “${savedRoutineName.value}”? All logged sets will be removed.`)) return
    workoutStore.removeWorkout(routineId)
  }

  return {
    discardSavedWorkout,
    savedHref,
    savedRoutineName,
    savedWorkout,
    savedWorkoutStarted,
    savedWorkoutStartedAtMs,
  }
}
