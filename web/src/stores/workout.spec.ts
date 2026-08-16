import { create } from '@bufbuild/protobuf'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ExerciseMetric, ExerciseSchema, WeightUnit } from '@/proto/api/v1/shared_pb'
import { useWorkoutStore } from '@/stores/workout'

describe('workout store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('does not append another empty set when legacy metrics are missing', () => {
    const store = useWorkoutStore()
    store.initialiseWorkout('quick-workout')

    store.addEmptySetIfNone('quick-workout', 'running', [])
    store.addEmptySetIfNone('quick-workout', 'running', [])

    expect(store.getSets('quick-workout', 'running')).toEqual([{}])
  })

  it('refreshes a saved exercise definition without losing its sets', () => {
    const store = useWorkoutStore()
    store.initialiseWorkout('quick-workout')
    store.addWorkoutExercise(
      'quick-workout',
      create(ExerciseSchema, {
        id: 'running',
        name: 'Running',
        metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
      }),
    )
    store.addEmptySetIfNone('quick-workout', 'running')

    store.addWorkoutExercise(
      'quick-workout',
      create(ExerciseSchema, {
        id: 'running',
        name: 'Running',
        metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME],
      }),
    )

    expect(store.getAddedExercises('quick-workout')[0]?.metrics).toEqual([
      ExerciseMetric.DISTANCE,
      ExerciseMetric.TIME,
    ])
    expect(store.getSets('quick-workout', 'running')).toEqual([{}])
  })

  it('starts a fresh quick workout with the selected exercise', () => {
    const store = useWorkoutStore()
    store.initialiseWorkout('quick-workout')
    store.addWorkoutExercise(
      'quick-workout',
      create(ExerciseSchema, {
        id: 'old-exercise',
        name: 'Old exercise',
        metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
      }),
    )
    store.addEmptySetIfNone('quick-workout', 'old-exercise')
    store.getSets('quick-workout', 'old-exercise')[0].weight = 50

    const running = create(ExerciseSchema, {
      id: 'running',
      name: 'Running',
      metrics: [ExerciseMetric.DISTANCE, ExerciseMetric.TIME],
    })
    store.startQuickWorkoutWithExercise(running)

    expect(store.getAddedExercises('quick-workout')).toEqual([running])
    expect(store.getSets('quick-workout', 'running')).toEqual([{}])
    expect(store.getSets('quick-workout', 'old-exercise')).toEqual([])
    expect(store.getStartedAt('quick-workout')).toBeTruthy()
  })

  it('tags legacy draft sets that carry no unit without touching their value', () => {
    const store = useWorkoutStore()
    store.workouts['routine-id'] = { exerciseSets: { squat: [{ weight: 100 }] } }

    store.syncWeightUnits('routine-id', WeightUnit.POUNDS)

    expect(store.getSets('routine-id', 'squat')[0]).toEqual({
      weight: 100,
      weightUnit: WeightUnit.POUNDS,
    })
  })

  it('converts a draft saved under an earlier preference to the current one', () => {
    const store = useWorkoutStore()
    store.workouts['routine-id'] = {
      exerciseSets: {
        squat: [{ weight: 100, weightUnit: WeightUnit.POUNDS }, { weightUnit: WeightUnit.POUNDS }],
        deadlift: [{ weight: 220.46, weightUnit: WeightUnit.POUNDS }],
      },
    }

    store.syncWeightUnits('routine-id', WeightUnit.KILOGRAMS)

    // 100 lb is the same weight as 45.36 kg: the displayed unit and the stored
    // value must never disagree, or the workout saves a weight nobody entered.
    expect(store.getSets('routine-id', 'squat')).toEqual([
      { weight: 45.36, weightUnit: WeightUnit.KILOGRAMS },
      { weightUnit: WeightUnit.KILOGRAMS },
    ])
    expect(store.getSets('routine-id', 'deadlift')).toEqual([
      { weight: 100, weightUnit: WeightUnit.KILOGRAMS },
    ])
  })

  it('leaves a draft alone when it already matches the preference', () => {
    const store = useWorkoutStore()
    store.workouts['routine-id'] = {
      exerciseSets: { squat: [{ weight: 100, weightUnit: WeightUnit.KILOGRAMS }] },
    }

    store.syncWeightUnits('routine-id', WeightUnit.KILOGRAMS)

    expect(store.getSets('routine-id', 'squat')[0]).toEqual({
      weight: 100,
      weightUnit: WeightUnit.KILOGRAMS,
    })
  })
})
