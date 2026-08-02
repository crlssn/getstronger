import type { ExerciseID, RoutineID, RoutineWorkout } from '@/types/workout'

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { isNumber } from '@/utils/numbers'

export const useWorkoutStore = defineStore(
  'workouts',
  () => {
    const workouts = ref({} as RoutineWorkout)

    const initialiseWorkout = (routineID: RoutineID) => {
      if (!workouts.value[routineID]) {
        workouts.value[routineID] = {}
      }

      if (!workouts.value[routineID].exerciseSets) {
        workouts.value[routineID].exerciseSets = {}
      }

      if (!workouts.value[routineID].startedAt) {
        workouts.value[routineID].startedAt = new Date().toISOString()
      }
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

    const setNote = (routineID: RoutineID, note: string) => {
      if (!workouts.value[routineID]) return
      workouts.value[routineID].note = note
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
      deleteSet,
      getAllSets,
      getNote,
      getSets,
      getStartedAt,
      initialiseWorkout,
      removeWorkout,
      setNote,
      workouts,
    }
  },
  {
    persist: true,
  },
)
