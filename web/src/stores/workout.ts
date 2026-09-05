import type { Exercise } from '@/proto/api/v1/shared_pb'
import type {
  ExerciseID,
  RoutineID,
  RoutineWorkout,
  Set as WorkoutSet,
  Workout,
} from '@/types/workout'

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'

import { migratedStorage } from '@/stores/persistence'

import { DistanceUnit, ExerciseMetric, WeightUnit } from '@/proto/api/v1/shared_pb'
import { convertDistance, normalizeDistanceUnit } from '@/utils/distanceUnits'
import { exerciseMetrics } from '@/utils/exerciseMeasurements'
import { isNumber } from '@/utils/numbers'
import { convertWeight, normalizeWeightUnit } from '@/utils/weightUnits'

export const quickWorkoutRoutineID: RoutineID = 'quick-workout'

// A new set carries the preferred units up front so its inputs and the value
// eventually typed into them can never disagree about the unit.
const emptySet = (weightUnit?: WeightUnit, distanceUnit?: DistanceUnit): WorkoutSet => ({
  ...(weightUnit ? { weightUnit } : {}),
  ...(distanceUnit ? { distanceUnit } : {}),
})

const metricFields: Partial<Record<ExerciseMetric, keyof WorkoutSet>> = {
  [ExerciseMetric.WEIGHT]: 'weight',
  [ExerciseMetric.REPS]: 'reps',
  [ExerciseMetric.DISTANCE]: 'distance',
  [ExerciseMetric.TIME]: 'durationSeconds',
}

// What somebody logged, as opposed to the unit the row was stamped with.
const measurementFields = Object.values(metricFields)
const isMeasurement = new Set<string>(measurementFields)

// Persisted drafts predate the numeric type, so a blank string can still
// reach this from storage and must not read as a logged value.
const isLogged = (value: unknown) =>
  value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0)

const logsAMeasurement = (changes: Partial<WorkoutSet>) =>
  Object.entries(changes).some(([field, value]) => isMeasurement.has(field) && isLogged(value))

/**
 * Whether the draft holds a number anybody logged.
 *
 * This is what it means for a workout to be under way: the clock is stamped
 * while it is true, and the tab bar offers the draft back on the same test.
 */
export const hasLoggedSet = (workout: Workout) =>
  Object.values(workout.exerciseSets ?? {}).some((sets) =>
    sets.some((entry) => measurementFields.some((field) => isLogged(entry[field]))),
  )

interface UpdateSetOptions {
  /**
   * A value the app proposed rather than one the athlete logged, so it leaves
   * the clock alone. Accepting it — typing over it, or completing the set —
   * starts the workout in the ordinary way.
   */
  suggested?: boolean
}

interface WorkoutState {
  workouts: RoutineWorkout
  initialiseWorkout: (routineID: RoutineID, planId?: string) => void
  addWorkoutExercise: (routineID: RoutineID, exercise: Exercise) => void
  setExerciseCompleted: (routineID: RoutineID, exerciseID: ExerciseID, completed: boolean) => void
  setNote: (routineID: RoutineID, note: string) => void
  setRestTimer: (routineID: RoutineID, endsAt?: string, totalSeconds?: number) => void
  addEmptySet: (
    routineID: RoutineID,
    exerciseID: ExerciseID,
    weightUnit?: WeightUnit,
    distanceUnit?: DistanceUnit,
  ) => void
  addEmptySetIfNone: (
    routineID: RoutineID,
    exerciseID: ExerciseID,
    metrics?: ExerciseMetric[],
    weightUnit?: WeightUnit,
    distanceUnit?: DistanceUnit,
  ) => void
  updateSet: (
    routineID: RoutineID,
    exerciseID: ExerciseID,
    index: number,
    changes: Partial<WorkoutSet>,
    options?: UpdateSetOptions,
  ) => void
  startWorkout: (routineID: RoutineID) => void
  syncWeightUnits: (routineID: RoutineID, weightUnit: WeightUnit) => void
  syncDistanceUnits: (routineID: RoutineID, distanceUnit: DistanceUnit) => void
  deleteSet: (routineID: RoutineID, exerciseID: ExerciseID, index: number) => void
  removeWorkout: (routineID: RoutineID) => void
  startQuickWorkoutWithExercise: (exercise: Exercise) => void
}

const noSets: WorkoutSet[] = []
const noExercises: Exercise[] = []
const noIds: ExerciseID[] = []

export const selectSets = (state: WorkoutState, routineID: RoutineID, exerciseID: ExerciseID) =>
  state.workouts[routineID]?.exerciseSets?.[exerciseID] ?? noSets

export const selectAllSets = (state: WorkoutState, routineID: RoutineID) =>
  state.workouts[routineID]?.exerciseSets

export const selectNote = (state: WorkoutState, routineID: RoutineID) =>
  state.workouts[routineID]?.note ?? ''

export const selectStartedAt = (state: WorkoutState, routineID: RoutineID) =>
  state.workouts[routineID]?.startedAt

export const selectPlanId = (state: WorkoutState, routineID: RoutineID) =>
  state.workouts[routineID]?.planId ?? ''

export const selectRestTimer = (state: WorkoutState, routineID: RoutineID) => ({
  endsAt: state.workouts[routineID]?.restTimerEndsAt,
  totalSeconds: state.workouts[routineID]?.restTimerTotalSeconds ?? 0,
})

export const selectAddedExercises = (state: WorkoutState, routineID: RoutineID) =>
  state.workouts[routineID]?.addedExercises ?? noExercises

export const selectCompletedExerciseIds = (state: WorkoutState, routineID: RoutineID) =>
  state.workouts[routineID]?.completedExerciseIds ?? noIds

/**
 * The in-progress workout drafts, one per routine, kept until they are saved.
 *
 * Immer earns its place here: the state is a map of maps of arrays, and every
 * action reaches several levels into it. Written by hand, each of these would
 * have to rebuild the path it touches.
 */
export const useWorkoutStore = create<WorkoutState>()(
  persist(
    immer((set, get) => ({
      workouts: {},

      // A draft is where the session is written down, not the session itself,
      // so it starts without a clock: `updateSet` stamps one at the first
      // value logged into it.
      initialiseWorkout: (routineID, planId = '') =>
        set((state) => {
          const workout = (state.workouts[routineID] ??= {})
          workout.exerciseSets ??= {}
          // A draft saved before the clock moved to the first logged set
          // carries one from the moment its screen opened, so an empty one
          // would resume counting from days ago.
          if (!hasLoggedSet(workout)) delete workout.startedAt
          // Kept with the draft rather than the screen, so a save pressed
          // again after a reload still names the same session.
          workout.idempotencyKey ??= crypto.randomUUID()
          if (planId) workout.planId = planId
        }),

      addWorkoutExercise: (routineID, exercise) =>
        set((state) => {
          const workout = state.workouts[routineID]
          if (!workout) return

          workout.addedExercises ??= []
          const existing = workout.addedExercises.findIndex((entry) => entry.id === exercise.id)
          if (existing >= 0) {
            // Exercise definitions can change while a workout draft is saved.
            // Keep the draft's reference current without touching any logged
            // set data.
            workout.addedExercises[existing] = exercise
          } else {
            workout.addedExercises.push(exercise)
          }
        }),

      setExerciseCompleted: (routineID, exerciseID, completed) =>
        set((state) => {
          const workout = state.workouts[routineID]
          if (!workout) return

          const completedIds = workout.completedExerciseIds ?? []
          workout.completedExerciseIds = completed
            ? [...new Set([...completedIds, exerciseID])]
            : completedIds.filter((id) => id !== exerciseID)
        }),

      setNote: (routineID, note) =>
        set((state) => {
          const workout = state.workouts[routineID]
          if (workout) workout.note = note
        }),

      setRestTimer: (routineID, endsAt, totalSeconds = 0) =>
        set((state) => {
          const workout = state.workouts[routineID]
          if (!workout) return

          if (!endsAt) {
            delete workout.restTimerEndsAt
            delete workout.restTimerTotalSeconds
            return
          }

          workout.restTimerEndsAt = endsAt
          workout.restTimerTotalSeconds = totalSeconds
        }),

      addEmptySet: (routineID, exerciseID, weightUnit, distanceUnit) =>
        set((state) => {
          const workout = state.workouts[routineID]
          if (!workout) return

          workout.exerciseSets ??= {}
          workout.exerciseSets[exerciseID] ??= []
          workout.exerciseSets[exerciseID].push(emptySet(weightUnit, distanceUnit))
        }),

      addEmptySetIfNone: (
        routineID,
        exerciseID,
        metrics = [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
        weightUnit,
        distanceUnit,
      ) =>
        set((state) => {
          const workout = state.workouts[routineID]
          if (!workout) return

          workout.exerciseSets ??= {}
          const sets = (workout.exerciseSets[exerciseID] ??= [])

          // Older persisted drafts may not contain metrics. Normalising here
          // avoids the empty-array `every()` case appending another blank row
          // on refresh.
          const fields = exerciseMetrics({ metrics })
            .map((metric) => metricFields[metric])
            .filter(Boolean) as Array<keyof WorkoutSet>

          const noEmptySet = sets.every((entry) => fields.every((field) => isNumber(entry[field])))
          if (noEmptySet) sets.push(emptySet(weightUnit, distanceUnit))
        }),

      /**
       * Writes a value into one logged set.
       *
       * The Vue screens assigned straight into the set object a `getSets` call
       * had handed them. Immer freezes state, so every edit comes through here
       * instead — which is also the only way a change notifies subscribers.
       * An `undefined` clears the field, so a cleared input is not stored as a
       * stale number.
       *
       * It is also where a workout starts and stops being under way: the clock
       * is stamped by the first measurement logged into it, so the minutes
       * spent picking a routine and walking to the rack are not counted as
       * training, and clearing the last one takes the stamp away again.
       */
      updateSet: (routineID, exerciseID, index, changes, options) =>
        set((state) => {
          const workout = state.workouts[routineID]
          const entry = workout?.exerciseSets?.[exerciseID]?.[index]
          if (!workout || !entry) return

          for (const [field, value] of Object.entries(changes) as Array<
            [keyof WorkoutSet, WorkoutSet[keyof WorkoutSet]]
          >) {
            if (value === undefined) delete entry[field]
            else Object.assign(entry, { [field]: value })
          }

          if (!options?.suggested && logsAMeasurement(changes)) {
            workout.startedAt ??= new Date().toISOString()
          }
          if (!hasLoggedSet(workout)) delete workout.startedAt
        }),

      // The screen calls this when a set is completed, which is how a
      // suggestion the athlete accepted without typing still starts the clock.
      startWorkout: (routineID) =>
        set((state) => {
          const workout = state.workouts[routineID]
          if (workout) workout.startedAt ??= new Date().toISOString()
        }),

      // The weight unit is a profile preference rather than a per-set choice,
      // so a draft saved under an earlier preference is realigned to the
      // current one here. Values are converted so the number keeps meaning the
      // same weight as what was originally entered. A set carrying no unit at
      // all predates the field, and its source is unknown, so it is only
      // tagged.
      syncWeightUnits: (routineID, weightUnit) =>
        set((state) => {
          const sets = state.workouts[routineID]?.exerciseSets
          if (!sets) return

          const target = normalizeWeightUnit(weightUnit)
          for (const entries of Object.values(sets)) {
            for (const entry of entries) {
              if (!entry.weightUnit) {
                entry.weightUnit = target
                continue
              }

              const current = normalizeWeightUnit(entry.weightUnit)
              if (current === target) continue

              if (isNumber(entry.weight)) {
                entry.weight = convertWeight(entry.weight as number, current, target)
              }
              entry.weightUnit = target
            }
          }
        }),

      // Same contract as syncWeightUnits for the distance preference: values
      // are converted so the number keeps meaning the same distance as
      // entered, and unit-less legacy sets are only tagged.
      syncDistanceUnits: (routineID, distanceUnit) =>
        set((state) => {
          const sets = state.workouts[routineID]?.exerciseSets
          if (!sets) return

          const target = normalizeDistanceUnit(distanceUnit)
          for (const entries of Object.values(sets)) {
            for (const entry of entries) {
              if (!entry.distanceUnit) {
                entry.distanceUnit = target
                continue
              }

              const current = normalizeDistanceUnit(entry.distanceUnit)
              if (current === target) continue

              if (isNumber(entry.distance)) {
                entry.distance = convertDistance(entry.distance as number, current, target)
              }
              entry.distanceUnit = target
            }
          }
        }),

      deleteSet: (routineID, exerciseID, index) =>
        set((state) => {
          const workout = state.workouts[routineID]
          if (!workout) return

          workout.exerciseSets?.[exerciseID]?.splice(index, 1)
          if (!hasLoggedSet(workout)) delete workout.startedAt
        }),

      removeWorkout: (routineID) =>
        set((state) => {
          delete state.workouts[routineID]
        }),

      startQuickWorkoutWithExercise: (exercise) => {
        const store = get()
        store.removeWorkout(quickWorkoutRoutineID)
        store.initialiseWorkout(quickWorkoutRoutineID)
        store.addWorkoutExercise(quickWorkoutRoutineID, exercise)
        store.addEmptySetIfNone(quickWorkoutRoutineID, exercise.id, exercise.metrics)
      },
    })),
    {
      name: 'workouts',
      storage: migratedStorage(),
      partialize: ({ workouts }) => ({ workouts }),
    },
  ),
)
