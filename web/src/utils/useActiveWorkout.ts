import type { Workout } from '@/types/workout'

import { computed } from 'vue'

import { i18n } from '@/i18n'
import { useDashboardStore } from '@/stores/dashboard'
import { useWorkoutStore } from '@/stores/workout'

const hasEnteredValue = (value: unknown) =>
  value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0)

// Opening a routine stamps startedAt before anything is logged, so a workout
// only counts as resumable once it holds real progress.
const hasProgress = (workout: Workout) =>
  Object.values(workout.exerciseSets ?? {}).some((sets) =>
    sets.some(
      (set) =>
        hasEnteredValue(set.weight) ||
        hasEnteredValue(set.reps) ||
        hasEnteredValue(set.distance) ||
        hasEnteredValue(set.durationSeconds),
    ),
  ) ||
  Boolean(workout.note?.trim()) ||
  Boolean(workout.addedExercises?.length)

// Shared view of the locally persisted in-progress workout.
export default function useActiveWorkout() {
  const workoutStore = useWorkoutStore()
  const dashboardStore = useDashboardStore()

  const savedWorkout = computed(
    () =>
      Object.entries(workoutStore.workouts)
        .filter(([, workout]) => workout.startedAt && hasProgress(workout))
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
    const { t } = i18n.global
    const routineId = savedWorkout.value?.[0]
    if (!routineId) return t('workout.inProgress')
    if (routineId === 'quick-workout') return t('workout.quick')
    return (
      dashboardStore.dashboard?.routines.find((routine) => routine.id === routineId)?.name ??
      t('workout.inProgress')
    )
  })

  const savedWorkoutStartedAtMs = computed(() => {
    const time = Date.parse(savedWorkout.value?.[1].startedAt ?? '')
    return Number.isNaN(time) ? undefined : time
  })

  const savedRestTimerEndsAtMs = computed(() => {
    const time = Date.parse(savedWorkout.value?.[1].restTimerEndsAt ?? '')
    return Number.isNaN(time) ? undefined : time
  })

  return {
    savedHref,
    savedRoutineName,
    savedWorkout,
    savedWorkoutStartedAtMs,
    savedRestTimerEndsAtMs,
  }
}
