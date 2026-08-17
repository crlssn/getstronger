import type { ExerciseID, RoutineID, RoutineWorkout, Set } from '@/types/workout'
import type { Exercise } from '@/proto/api/v1/shared_pb'

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { isNumber } from '@/utils/numbers'
import { DistanceUnit, ExerciseMetric, WeightUnit } from '@/proto/api/v1/shared_pb'
import { exerciseMetrics } from '@/utils/exerciseMeasurements'
import { convertWeight, normalizeWeightUnit } from '@/utils/weightUnits'
import { convertDistance, normalizeDistanceUnit } from '@/utils/distanceUnits'

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
      const existingIndex = workout.addedExercises.findIndex((entry) => entry.id === exercise.id)
      if (existingIndex >= 0) {
        // Exercise definitions can change while a workout draft is saved. Keep
        // the draft's reference current without touching any logged set data.
        workout.addedExercises[existingIndex] = exercise
      } else {
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

    // A new set carries the preferred units up front so its inputs and the
    // value eventually typed into them can never disagree about the unit.
    const emptySet = (weightUnit?: WeightUnit, distanceUnit?: DistanceUnit): Set => ({
      ...(weightUnit ? { weightUnit } : {}),
      ...(distanceUnit ? { distanceUnit } : {}),
    })

    const addEmptySet = (
      routineID: RoutineID,
      exerciseID: ExerciseID,
      weightUnit?: WeightUnit,
      distanceUnit?: DistanceUnit,
    ) => {
      const workout = workouts.value[routineID]
      workout.exerciseSets = workout.exerciseSets || {}
      workout.exerciseSets[exerciseID] = workout.exerciseSets[exerciseID] || []
      workout.exerciseSets[exerciseID].push(emptySet(weightUnit, distanceUnit))
    }

    const addEmptySetIfNone = (
      routineID: RoutineID,
      exerciseID: ExerciseID,
      metrics: ExerciseMetric[] = [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
      weightUnit?: WeightUnit,
      distanceUnit?: DistanceUnit,
    ) => {
      const workout = workouts.value[routineID]
      workout.exerciseSets = workout.exerciseSets || {}
      workout.exerciseSets[exerciseID] = workout.exerciseSets[exerciseID] || []

      const metricFields: Partial<Record<ExerciseMetric, keyof Set>> = {
        [ExerciseMetric.WEIGHT]: 'weight',
        [ExerciseMetric.REPS]: 'reps',
        [ExerciseMetric.DISTANCE]: 'distance',
        [ExerciseMetric.TIME]: 'durationSeconds',
      }
      // Older persisted drafts may not contain metrics. Normalising here avoids
      // the empty-array `every()` case appending another blank row on refresh.
      const fields = exerciseMetrics({ metrics })
        .map((metric) => metricFields[metric])
        .filter(Boolean) as Array<keyof Set>
      const noEmptySet = workout.exerciseSets[exerciseID].every((set) =>
        fields.every((field) => isNumber(set[field])),
      )
      if (noEmptySet) {
        workout.exerciseSets[exerciseID].push(emptySet(weightUnit, distanceUnit))
      }
    }

    // The weight unit is a profile preference rather than a per-set choice, so
    // a draft saved under an earlier preference is realigned to the current one
    // here. Values are converted so the number keeps meaning the same weight as
    // what was originally entered. A set carrying no unit at all predates the
    // field, and its source is unknown, so it is only tagged.
    const syncWeightUnits = (routineID: RoutineID, weightUnit: WeightUnit) => {
      const workout = workouts.value[routineID]
      if (!workout?.exerciseSets) return

      const target = normalizeWeightUnit(weightUnit)
      Object.values(workout.exerciseSets).forEach((sets) => {
        sets.forEach((set) => {
          if (!set.weightUnit) {
            set.weightUnit = target
            return
          }

          const current = normalizeWeightUnit(set.weightUnit)
          if (current === target) return

          const weight = set.weight
          if (typeof weight === 'number' && !Number.isNaN(weight)) {
            set.weight = convertWeight(weight, current, target)
          }
          set.weightUnit = target
        })
      })
    }

    // Same contract as syncWeightUnits for the distance preference: values are
    // converted so the number keeps meaning the same distance as entered, and
    // unit-less legacy sets are only tagged.
    const syncDistanceUnits = (routineID: RoutineID, distanceUnit: DistanceUnit) => {
      const workout = workouts.value[routineID]
      if (!workout?.exerciseSets) return

      const target = normalizeDistanceUnit(distanceUnit)
      Object.values(workout.exerciseSets).forEach((sets) => {
        sets.forEach((set) => {
          if (!set.distanceUnit) {
            set.distanceUnit = target
            return
          }

          const current = normalizeDistanceUnit(set.distanceUnit)
          if (current === target) return

          const distance = set.distance
          if (typeof distance === 'number' && !Number.isNaN(distance)) {
            set.distance = convertDistance(distance, current, target)
          }
          set.distanceUnit = target
        })
      })
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

    const startQuickWorkoutWithExercise = (exercise: Exercise) => {
      const routineID = 'quick-workout'
      removeWorkout(routineID)
      initialiseWorkout(routineID)
      addWorkoutExercise(routineID, exercise)
      addEmptySetIfNone(routineID, exercise.id, exercise.metrics)
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
      syncWeightUnits,
      syncDistanceUnits,
      initialiseWorkout,
      removeWorkout,
      startQuickWorkoutWithExercise,
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
