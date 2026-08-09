import { create } from '@bufbuild/protobuf'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { ExerciseMetric, ExerciseSchema } from '@/proto/api/v1/shared_pb'
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
})
