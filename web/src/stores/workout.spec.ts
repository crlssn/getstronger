// @vitest-environment jsdom

import { create } from '@bufbuild/protobuf'
import { beforeEach, describe, expect, it } from 'vitest'

import { DistanceUnit, ExerciseMetric, ExerciseSchema, WeightUnit } from '@/proto/api/v1/shared_pb'
import type { RoutineWorkout } from '@/types/workout'
import {
  quickWorkoutRoutineID as quick,
  selectAddedExercises,
  selectAllSets,
  selectCompletedExerciseIds,
  selectNote,
  selectPlanId,
  selectRestTimer,
  selectSets,
  selectStartedAt,
  useWorkoutStore,
} from './workout'

const store = () => useWorkoutStore.getState()

const sets = (routineID: string, exerciseID: string) =>
  selectSets(useWorkoutStore.getState(), routineID, exerciseID)

const seed = (workouts: RoutineWorkout) => useWorkoutStore.setState({ workouts })

const exercise = (id: string, metrics: ExerciseMetric[]) =>
  create(ExerciseSchema, { id, name: id, metrics })

const weighted = [ExerciseMetric.WEIGHT, ExerciseMetric.REPS]
const timed = [ExerciseMetric.DISTANCE, ExerciseMetric.TIME]

describe('workout store', () => {
  beforeEach(() => {
    localStorage.clear()
    useWorkoutStore.setState({ workouts: {} })
  })

  describe('drafts', () => {
    it('starts a draft with a clock and an empty set map', () => {
      store().initialiseWorkout('routine-id')

      expect(selectStartedAt(store(), 'routine-id')).toBeTruthy()
      expect(selectAllSets(store(), 'routine-id')).toEqual({})
      expect(selectPlanId(store(), 'routine-id')).toBe('')
    })

    it('records the plan a draft belongs to', () => {
      store().initialiseWorkout('routine-id', 'plan-id')

      expect(selectPlanId(store(), 'routine-id')).toBe('plan-id')
    })

    // Reopening a workout must not restart its clock or discard its sets.
    it('leaves an existing draft alone when initialised again', () => {
      store().initialiseWorkout('routine-id')
      store().addEmptySet('routine-id', 'squat')
      const startedAt = selectStartedAt(store(), 'routine-id')

      store().initialiseWorkout('routine-id')

      expect(selectStartedAt(store(), 'routine-id')).toBe(startedAt)
      expect(sets('routine-id', 'squat')).toHaveLength(1)
    })

    it('discards a draft', () => {
      store().initialiseWorkout('routine-id')

      store().removeWorkout('routine-id')

      expect(store().workouts['routine-id']).toBeUndefined()
    })

    it('reads nothing from a draft that does not exist', () => {
      expect(sets('missing', 'squat')).toEqual([])
      expect(selectAllSets(store(), 'missing')).toBeUndefined()
      expect(selectNote(store(), 'missing')).toBe('')
      expect(selectAddedExercises(store(), 'missing')).toEqual([])
      expect(selectCompletedExerciseIds(store(), 'missing')).toEqual([])
      expect(selectRestTimer(store(), 'missing')).toEqual({
        endsAt: undefined,
        totalSeconds: 0,
      })
    })

    // The draft is what survives closing the app mid-workout.
    it('persists the drafts', () => {
      store().initialiseWorkout('routine-id')

      expect(JSON.parse(localStorage.getItem('workouts') ?? '{}')).toMatchObject({
        state: { workouts: { 'routine-id': {} } },
      })
    })
  })

  describe('exercises', () => {
    it('refreshes a saved exercise definition without losing its sets', () => {
      store().initialiseWorkout(quick)
      store().addWorkoutExercise(quick, exercise('running', weighted))
      store().addEmptySetIfNone(quick, 'running')

      store().addWorkoutExercise(quick, exercise('running', timed))

      expect(selectAddedExercises(store(), quick)[0]?.metrics).toEqual(timed)
      expect(sets(quick, 'running')).toEqual([{}])
    })

    it('appends a second exercise rather than replacing the first', () => {
      store().initialiseWorkout(quick)
      store().addWorkoutExercise(quick, exercise('squat', weighted))
      store().addWorkoutExercise(quick, exercise('bench', weighted))

      expect(selectAddedExercises(store(), quick).map((e) => e.id)).toEqual(['squat', 'bench'])
    })

    it('ignores an exercise added to a draft that does not exist', () => {
      store().addWorkoutExercise('missing', exercise('squat', weighted))

      expect(selectAddedExercises(store(), 'missing')).toEqual([])
    })

    it('marks an exercise completed and lets it be reopened', () => {
      store().initialiseWorkout(quick)

      store().setExerciseCompleted(quick, 'squat', true)
      expect(selectCompletedExerciseIds(store(), quick)).toEqual(['squat'])

      store().setExerciseCompleted(quick, 'squat', false)
      expect(selectCompletedExerciseIds(store(), quick)).toEqual([])
    })

    it('does not record an exercise as completed twice', () => {
      store().initialiseWorkout(quick)

      store().setExerciseCompleted(quick, 'squat', true)
      store().setExerciseCompleted(quick, 'squat', true)

      expect(selectCompletedExerciseIds(store(), quick)).toEqual(['squat'])
    })
  })

  describe('sets', () => {
    it('does not append another empty set when legacy metrics are missing', () => {
      store().initialiseWorkout(quick)

      store().addEmptySetIfNone(quick, 'running', [])
      store().addEmptySetIfNone(quick, 'running', [])

      expect(sets(quick, 'running')).toEqual([{}])
    })

    it('adds a set once the previous one is filled in', () => {
      store().initialiseWorkout(quick)
      store().addEmptySetIfNone(quick, 'squat')
      seed({
        [quick]: { exerciseSets: { squat: [{ weight: 100, reps: 5 }] } },
      })

      store().addEmptySetIfNone(quick, 'squat')

      expect(sets(quick, 'squat')).toEqual([{ weight: 100, reps: 5 }, {}])
    })

    it('always adds a set when asked directly', () => {
      store().initialiseWorkout(quick)

      store().addEmptySet(quick, 'squat')
      store().addEmptySet(quick, 'squat')

      expect(sets(quick, 'squat')).toEqual([{}, {}])
    })

    it('stamps new empty sets with the preferred units', () => {
      store().initialiseWorkout(quick)

      store().addEmptySetIfNone(quick, 'running', timed, WeightUnit.KILOGRAMS, DistanceUnit.MILES)

      expect(sets(quick, 'running')).toEqual([
        { weightUnit: WeightUnit.KILOGRAMS, distanceUnit: DistanceUnit.MILES },
      ])
    })

    // Immer freezes the state, so the screens cannot assign into a set the way
    // the Vue ones did; every edit comes through this action.
    it('writes a value into a logged set', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{}, {}] } } })

      store().updateSet('routine-id', 'squat', 1, { weight: 100, reps: 5 })

      expect(sets('routine-id', 'squat')).toEqual([{}, { weight: 100, reps: 5 }])
    })

    // A cleared input must not leave the previous number behind.
    it('clears a field set to undefined', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{ weight: 100, reps: 5 }] } } })

      store().updateSet('routine-id', 'squat', 0, { weight: undefined })

      expect(sets('routine-id', 'squat')).toEqual([{ reps: 5 }])
    })

    it('leaves the fields it was not given alone', () => {
      seed({
        'routine-id': {
          exerciseSets: { squat: [{ weight: 100, weightUnit: WeightUnit.KILOGRAMS }] },
        },
      })

      store().updateSet('routine-id', 'squat', 0, { reps: 5 })

      expect(sets('routine-id', 'squat')).toEqual([
        { weight: 100, weightUnit: WeightUnit.KILOGRAMS, reps: 5 },
      ])
    })

    it('ignores a write to a set that does not exist', () => {
      expect(() => store().updateSet('missing', 'squat', 0, { weight: 1 })).not.toThrow()

      seed({ 'routine-id': { exerciseSets: { squat: [{}] } } })
      expect(() => store().updateSet('routine-id', 'squat', 9, { weight: 1 })).not.toThrow()
      expect(sets('routine-id', 'squat')).toEqual([{}])
    })

    it('deletes a set by position', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{ weight: 1 }, { weight: 2 }] } } })

      store().deleteSet('routine-id', 'squat', 0)

      expect(sets('routine-id', 'squat')).toEqual([{ weight: 2 }])
    })

    it('ignores a delete for a draft or exercise that does not exist', () => {
      expect(() => store().deleteSet('missing', 'squat', 0)).not.toThrow()

      store().initialiseWorkout('routine-id')
      expect(() => store().deleteSet('routine-id', 'squat', 0)).not.toThrow()
    })
  })

  describe('note and rest timer', () => {
    it('keeps a note against the draft', () => {
      store().initialiseWorkout('routine-id')

      store().setNote('routine-id', 'Felt strong')

      expect(selectNote(store(), 'routine-id')).toBe('Felt strong')
    })

    it('runs and clears a rest timer', () => {
      store().initialiseWorkout('routine-id')

      store().setRestTimer('routine-id', '2026-08-14T12:03:00Z', 180)
      expect(selectRestTimer(store(), 'routine-id')).toEqual({
        endsAt: '2026-08-14T12:03:00Z',
        totalSeconds: 180,
      })

      store().setRestTimer('routine-id')
      expect(selectRestTimer(store(), 'routine-id')).toEqual({
        endsAt: undefined,
        totalSeconds: 0,
      })
    })
  })

  describe('quick workout', () => {
    it('starts a fresh quick workout with the selected exercise', () => {
      store().initialiseWorkout(quick)
      store().addWorkoutExercise(quick, exercise('old-exercise', weighted))
      seed({ [quick]: { exerciseSets: { 'old-exercise': [{ weight: 50 }] } } })

      const running = exercise('running', timed)
      store().startQuickWorkoutWithExercise(running)

      expect(selectAddedExercises(store(), quick)).toEqual([running])
      expect(sets(quick, 'running')).toEqual([{}])
      expect(sets(quick, 'old-exercise')).toEqual([])
      expect(selectStartedAt(store(), quick)).toBeTruthy()
    })
  })

  describe('syncWeightUnits', () => {
    it('tags legacy draft sets that carry no unit without touching their value', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{ weight: 100 }] } } })

      store().syncWeightUnits('routine-id', WeightUnit.POUNDS)

      expect(sets('routine-id', 'squat')[0]).toEqual({
        weight: 100,
        weightUnit: WeightUnit.POUNDS,
      })
    })

    it('converts a draft saved under an earlier preference to the current one', () => {
      seed({
        'routine-id': {
          exerciseSets: {
            squat: [
              { weight: 100, weightUnit: WeightUnit.POUNDS },
              { weightUnit: WeightUnit.POUNDS },
            ],
            deadlift: [{ weight: 220.46, weightUnit: WeightUnit.POUNDS }],
          },
        },
      })

      store().syncWeightUnits('routine-id', WeightUnit.KILOGRAMS)

      // 100 lb is the same weight as 45.36 kg: the displayed unit and the
      // stored value must never disagree, or the workout saves a weight nobody
      // entered.
      expect(sets('routine-id', 'squat')).toEqual([
        { weight: 45.36, weightUnit: WeightUnit.KILOGRAMS },
        { weightUnit: WeightUnit.KILOGRAMS },
      ])
      expect(sets('routine-id', 'deadlift')).toEqual([
        { weight: 100, weightUnit: WeightUnit.KILOGRAMS },
      ])
    })

    it('leaves a draft alone when it already matches the preference', () => {
      seed({
        'routine-id': {
          exerciseSets: { squat: [{ weight: 100, weightUnit: WeightUnit.KILOGRAMS }] },
        },
      })

      store().syncWeightUnits('routine-id', WeightUnit.KILOGRAMS)

      expect(sets('routine-id', 'squat')[0]).toEqual({
        weight: 100,
        weightUnit: WeightUnit.KILOGRAMS,
      })
    })

    it('does nothing for a draft with no sets', () => {
      expect(() => store().syncWeightUnits('missing', WeightUnit.POUNDS)).not.toThrow()
    })
  })

  describe('syncDistanceUnits', () => {
    it('tags legacy draft sets that carry no distance unit without touching their value', () => {
      seed({ 'routine-id': { exerciseSets: { running: [{ distance: 5 }] } } })

      store().syncDistanceUnits('routine-id', DistanceUnit.MILES)

      expect(sets('routine-id', 'running')[0]).toEqual({
        distance: 5,
        distanceUnit: DistanceUnit.MILES,
      })
    })

    it('converts draft distances saved under an earlier preference to the current one', () => {
      seed({
        'routine-id': {
          exerciseSets: {
            running: [
              { distance: 10, distanceUnit: DistanceUnit.MILES },
              { distanceUnit: DistanceUnit.MILES },
            ],
          },
        },
      })

      store().syncDistanceUnits('routine-id', DistanceUnit.KILOMETERS)

      // 10 mi is the same distance as 16.09 km: the displayed unit and the
      // stored value must never disagree.
      expect(sets('routine-id', 'running')).toEqual([
        { distance: 16.09, distanceUnit: DistanceUnit.KILOMETERS },
        { distanceUnit: DistanceUnit.KILOMETERS },
      ])
    })

    it('does nothing for a draft with no sets', () => {
      expect(() => store().syncDistanceUnits('missing', DistanceUnit.MILES)).not.toThrow()
    })
  })
})
