import type { ExerciseID, RoutineID, RoutineWorkout } from '@/types/workout'
import type { Exercise } from '@/proto/api/v1/shared_pb'

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { isNumber } from '@/utils/numbers'

export const useWorkoutStore = defineStore(
  'workouts',
  () => {
    const workouts = ref({} as RoutineWorkout)

    const initialiseWorkout = (routineID: RoutineID, planId = '') => {
      if (!workouts.value[routineID]) {
        workouts.value[routineID] = {}
      }

      if (!workouts.value[routineID].exerciseSets) {
        workouts.value[routineID].exerciseSets = {}
      }

      if (!workouts.value[routineID].startedAt) {
        workouts.value[routineID].startedAt = new Date().toISOString()
      }

      if (planId) workouts.value[routineID].planId = planId
    }

    const getSets = (routineID: RoutineID, exerciseID: ExerciseID) => {
      if (!workouts.value[routineID]) {
        return []
      }

      if (!workouts.value[routineID].exerciseSets) {
        return []
      }

      if (!workouts.value[routineID].exerciseSets[exerciseID]) {
        return []
      }

      return workouts.value[routineID].exerciseSets[exerciseID]
    }

    const getAllSets = (routineID: RoutineID) => {
      return workouts.value[routineID]?.exerciseSets
    }

    const getNote = (routineID: RoutineID) => workouts.value[routineID]?.note ?? ''

    const getStartedAt = (routineID: RoutineID) => workouts.value[routineID]?.startedAt

    const getPlanId = (routineID: RoutineID) => workouts.value[routineID]?.planId ?? ''

    const getRestTimer = (routineID: RoutineID) => ({
      endsAt: workouts.value[routineID]?.restTimerEndsAt,
      totalSeconds: workouts.value[routineID]?.restTimerTotalSeconds ?? 0,
    })

    const getAddedExercises = (routineID: RoutineID) =>
      workouts.value[routineID]?.addedExercises ?? []

    const getCompletedExerciseIds = (routineID: RoutineID) =>
      workouts.value[routineID]?.completedExerciseIds ?? []

    const addWorkoutExercise = (routineID: RoutineID, exercise: Exercise) => {
      const workout = workouts.value[routineID]
      if (!workout) return

      workout.addedExercises = workout.addedExercises || []
      if (!workout.addedExercises.some((entry) => entry.id === exercise.id)) {
        workout.addedExercises.push(exercise)
      }
    }

    const setExerciseCompleted = (
      routineID: RoutineID,
      exerciseID: ExerciseID,
      completed: boolean,
    ) => {
      const workout = workouts.value[routineID]
      if (!workout) return

      const completedIds = workout.completedExerciseIds ?? []
      workout.completedExerciseIds = completed
        ? [...new Set([...completedIds, exerciseID])]
        : completedIds.filter((id) => id !== exerciseID)
    }

    const setNote = (routineID: RoutineID, note: string) => {
      if (!workouts.value[routineID]) return
      workouts.value[routineID].note = note
    }

    const setRestTimer = (routineID: RoutineID, endsAt?: string, totalSeconds = 0) => {
      const workout = workouts.value[routineID]
      if (!workout) return

      if (!endsAt) {
        delete workout.restTimerEndsAt
        delete workout.restTimerTotalSeconds
        return
      }

      workout.restTimerEndsAt = endsAt
      workout.restTimerTotalSeconds = totalSeconds
    }

    const addEmptySet = (routineID: RoutineID, exerciseID: ExerciseID) => {
      const workout = workouts.value[routineID]
      workout.exerciseSets = workout.exerciseSets || {}
      workout.exerciseSets[exerciseID] = workout.exerciseSets[exerciseID] || []
      workout.exerciseSets[exerciseID].push({})
    }

    const addEmptySetIfNone = (routineID: RoutineID, exerciseID: ExerciseID) => {
      const workout = workouts.value[routineID]
      workout.exerciseSets = workout.exerciseSets || {}
      workout.exerciseSets[exerciseID] = workout.exerciseSets[exerciseID] || []

      const noEmptySet = workout.exerciseSets[exerciseID].every(
        (set) => isNumber(set.weight) && isNumber(set.reps),
      )
      if (noEmptySet) {
        workout.exerciseSets[exerciseID].push({})
      }
    }

    const deleteSet = (routineID: RoutineID, exerciseID: ExerciseID, index: number) => {
      if (!workouts.value[routineID]) return
      if (!workouts.value[routineID].exerciseSets) return
      if (!workouts.value[routineID].exerciseSets[exerciseID]) return

      workouts.value[routineID].exerciseSets[exerciseID].splice(index, 1)
    }

    const removeWorkout = (routineID: RoutineID) => {
      delete workouts.value[routineID]
    }

    return {
      addEmptySet,
      addEmptySetIfNone,
      addWorkoutExercise,
      deleteSet,
      getAddedExercises,
      getAllSets,
      getCompletedExerciseIds,
      getNote,
      getPlanId,
      getRestTimer,
      getSets,
      getStartedAt,
      initialiseWorkout,
      removeWorkout,
      setExerciseCompleted,
      setNote,
      setRestTimer,
      workouts,
    }
  },
  {
    persist: true,
  },
)
