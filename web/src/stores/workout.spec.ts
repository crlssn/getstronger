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
    // The clock is the workout's, not the screen's: opening a routine to read
    // it is not training, so the draft starts without one.
    it('starts a draft with an empty set map and an unstarted clock', () => {
      store().initialiseWorkout('routine-id')

      expect(selectStartedAt(store(), 'routine-id')).toBeUndefined()
      expect(selectAllSets(store(), 'routine-id')).toEqual({})
      expect(selectPlanId(store(), 'routine-id')).toBe('')
    })

    it('records the plan a draft belongs to', () => {
      store().initialiseWorkout('routine-id', 'plan-id')

      expect(selectPlanId(store(), 'routine-id')).toBe('plan-id')
    })

    // The key names one session across every attempt to save it, so it is
    // minted once and kept: a reopened draft, and a draft from before keys
    // existed, must not get a fresh one.
    it('mints a save key once per draft', () => {
      store().initialiseWorkout('routine-id')
      const key = store().workouts['routine-id']?.idempotencyKey
      expect(key).toMatch(/^[0-9a-f-]{36}$/)

      store().initialiseWorkout('routine-id')
      expect(store().workouts['routine-id']?.idempotencyKey).toBe(key)

      useWorkoutStore.setState({ workouts: { legacy: { startedAt: '2024-01-01T00:00:00Z' } } })
      store().initialiseWorkout('legacy')
      expect(store().workouts.legacy?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
      expect(store().workouts.legacy?.idempotencyKey).not.toBe(key)
    })

    // Drafts saved before the clock moved to the first logged set carry a
    // stamp from the moment their screen opened, which can be days old.
    it('drops the stamp on an older draft that logged nothing', () => {
      seed({ legacy: { startedAt: '2024-01-01T00:00:00Z', exerciseSets: { squat: [{}] } } })

      store().initialiseWorkout('legacy')

      expect(selectStartedAt(store(), 'legacy')).toBeUndefined()
    })

    it('keeps the stamp on an older draft that holds a logged set', () => {
      seed({
        legacy: { startedAt: '2024-01-01T00:00:00Z', exerciseSets: { squat: [{ reps: 5 }] } },
      })

      store().initialiseWorkout('legacy')

      expect(selectStartedAt(store(), 'legacy')).toBe('2024-01-01T00:00:00Z')
    })

    // Reopening a workout must not restart its clock or discard its sets.
    it('leaves an existing draft alone when initialised again', () => {
      store().initialiseWorkout('routine-id')
      store().addEmptySet('routine-id', 'squat')
      store().updateSet('routine-id', 'squat', 0, { weight: 100 })
      const startedAt = selectStartedAt(store(), 'routine-id')
      expect(startedAt).toBeTruthy()

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

    // The clock starts when the workout does. Everything before the first
    // number — reading the routine, walking to the rack — is not the session.
    it('starts the clock at the first logged value', () => {
      store().initialiseWorkout('routine-id')
      store().addEmptySet('routine-id', 'squat')
      expect(selectStartedAt(store(), 'routine-id')).toBeUndefined()

      store().updateSet('routine-id', 'squat', 0, { weight: 100 })

      expect(selectStartedAt(store(), 'routine-id')).toBeTruthy()
    })

    it("keeps the first value's time when later sets are logged", () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{}, {}] } } })
      store().updateSet('routine-id', 'squat', 0, { weight: 100 })
      const startedAt = selectStartedAt(store(), 'routine-id')

      store().updateSet('routine-id', 'squat', 1, { weight: 110 })

      expect(selectStartedAt(store(), 'routine-id')).toBe(startedAt)
    })

    it('leaves the clock unstarted when a field is only cleared', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{}] } } })

      store().updateSet('routine-id', 'squat', 0, { weight: undefined })

      expect(selectStartedAt(store(), 'routine-id')).toBeUndefined()
    })

    // A unit is a preference the row was stamped with, not something anybody
    // logged, so it must not start the session.
    it('leaves the clock unstarted for a unit-only write', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{}] } } })

      store().updateSet('routine-id', 'squat', 0, { weightUnit: WeightUnit.POUNDS })

      expect(selectStartedAt(store(), 'routine-id')).toBeUndefined()
    })

    // The autofill copies the last session's number into a field the athlete
    // has only landed on. Reading what you lifted last week is not training.
    it('leaves the clock unstarted for a suggested value', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{}] } } })

      store().updateSet('routine-id', 'squat', 0, { weight: 100 }, { suggested: true })

      expect(sets('routine-id', 'squat')[0]).toEqual({ weight: 100 })
      expect(selectStartedAt(store(), 'routine-id')).toBeUndefined()
    })

    it('starts the clock when a suggested value is typed over', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{}] } } })
      store().updateSet('routine-id', 'squat', 0, { weight: 100 }, { suggested: true })

      store().updateSet('routine-id', 'squat', 0, { weight: 105 })

      expect(selectStartedAt(store(), 'routine-id')).toBeTruthy()
    })

    // Clearing the last number undoes the start too, or a value typed by
    // mistake and deleted would go on counting as time under the bar.
    it('unstarts the clock when the last logged value is cleared', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{}] } } })
      store().updateSet('routine-id', 'squat', 0, { weight: 100 })
      expect(selectStartedAt(store(), 'routine-id')).toBeTruthy()

      store().updateSet('routine-id', 'squat', 0, { weight: undefined })

      expect(selectStartedAt(store(), 'routine-id')).toBeUndefined()
    })

    it('keeps the clock while another set still holds a value', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{}, {}] } } })
      store().updateSet('routine-id', 'squat', 0, { weight: 100 })
      store().updateSet('routine-id', 'squat', 1, { weight: 110 })
      const startedAt = selectStartedAt(store(), 'routine-id')

      store().updateSet('routine-id', 'squat', 0, { weight: undefined })

      expect(selectStartedAt(store(), 'routine-id')).toBe(startedAt)
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

    it('unstarts the clock when the last logged set is deleted', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{}] } } })
      store().updateSet('routine-id', 'squat', 0, { weight: 100 })

      store().deleteSet('routine-id', 'squat', 0)

      expect(selectStartedAt(store(), 'routine-id')).toBeUndefined()
    })

    it('ignores a delete for a draft or exercise that does not exist', () => {
      expect(() => store().deleteSet('missing', 'squat', 0)).not.toThrow()

      store().initialiseWorkout('routine-id')
      expect(() => store().deleteSet('routine-id', 'squat', 0)).not.toThrow()
    })

    // A suggestion the athlete accepts by completing the set is a logged set
    // like any other, so the screen starts the clock on the crossing.
    it('starts the clock on a completed set', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{}] } } })
      store().updateSet('routine-id', 'squat', 0, { weight: 100 }, { suggested: true })

      store().startWorkout('routine-id')

      expect(selectStartedAt(store(), 'routine-id')).toBeTruthy()
    })

    it('keeps the original time when the clock is started again', () => {
      seed({ 'routine-id': { exerciseSets: { squat: [{}] } } })
      store().updateSet('routine-id', 'squat', 0, { weight: 100 })
      const startedAt = selectStartedAt(store(), 'routine-id')

      store().startWorkout('routine-id')

      expect(selectStartedAt(store(), 'routine-id')).toBe(startedAt)
    })

    it('ignores starting a draft that does not exist', () => {
      expect(() => store().startWorkout('missing')).not.toThrow()
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
      // Picked, not started: the clock waits for the first logged value.
      expect(selectStartedAt(store(), quick)).toBeUndefined()
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
