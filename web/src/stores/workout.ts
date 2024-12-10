import type { ExerciseID, RoutineID, RoutineWorkout } from '@/types/workout'

import { ref } from 'vue'
import { defineStore } from 'pinia'

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
      return workouts.value[routineID].exerciseSets
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

      const noEmptySet = workout.exerciseSets[exerciseID].every((set) => set.weight && set.reps)
      if (noEmptySet) {
        workout.exerciseSets[exerciseID].push({})
      }
    }

    const deleteSet = (routineID: RoutineID, exerciseID: ExerciseID, setIndex: number) => {
      if (!workouts.value[routineID]) {
        return
      }

      if (!workouts.value[routineID].exerciseSets) {
        return
      }

      if (!workouts.value[routineID].exerciseSets[exerciseID]) {
        return
      }

      workouts.value[routineID].exerciseSets[exerciseID].splice(setIndex, 1)
    }

    const removeWorkout = (routineID: RoutineID) => {
      delete workouts.value[routineID]
    }

    return {
      addEmptySet,
      addEmptySetIfNone,
      deleteSet,
      getAllSets,
      getSets,
      initialiseWorkout,
      removeWorkout,
      workouts,
    }
  },
  {
    persist: true,
  },
)
