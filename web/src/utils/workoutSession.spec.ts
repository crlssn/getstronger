import type { SessionExercise } from './workoutSession'

import { create } from '@bufbuild/protobuf'
import { describe, expect, test } from 'vitest'

import { RoutineGroupMode, RoutineGroupSchema } from '@/proto/api/v1/routine_service_pb'
import { ExerciseMetric, ExerciseSchema } from '@/proto/api/v1/shared_pb'
import { defaultRestSeconds } from '@/utils/routineGroups'
import {
  activeSetIndex,
  circuitRound,
  elapsedLabel,
  finishBlocker,
  incompleteSetCount,
  loggedSetCount,
  nextCircuitStep,
  nextUnfinishedStation,
  sessionGroups,
} from './workoutSession'

const lift = (id: string) =>
  create(ExerciseSchema, {
    id,
    name: id,
    metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS],
  })

// One exercise where a group trains it, and the rest it takes there.
const trains = (exerciseId: string, restSeconds = 90) => ({
  exercise: lift(exerciseId),
  restSeconds,
})

// Plain objects, like the store's own sets: a `create`d Set carries proto3
// zeros, which read as values somebody typed.
const done = () => ({ weight: 100, reps: 5 })
const half = () => ({ weight: 100 })
const blank = () => ({})

const session = (...sets: (typeof blank)[][]): SessionExercise[] =>
  sets.map((group, index) => ({ exercise: lift(`e${index}`), sets: group.map((make) => make()) }))

describe('elapsedLabel', () => {
  test('is minutes and seconds under an hour', () => {
    expect(elapsedLabel(0)).toBe('0:00')
    expect(elapsedLabel(65)).toBe('1:05')
    expect(elapsedLabel(3599)).toBe('59:59')
  })

  // Past an hour it gains the hours rather than counting to 90 minutes.
  test('gains an hours field past one', () => {
    expect(elapsedLabel(3600)).toBe('1:00:00')
    expect(elapsedLabel(3725)).toBe('1:02:05')
  })
})

describe('loggedSetCount', () => {
  test('counts only the sets with everything filled in', () => {
    expect(loggedSetCount(session([done, half, blank], [done]))).toBe(2)
  })

  test('is zero for an empty session', () => {
    expect(loggedSetCount([])).toBe(0)
  })
})

describe('incompleteSetCount', () => {
  // A blank row is the next set waiting to be typed into, not a mistake.
  test('counts only the rows somebody started', () => {
    expect(incompleteSetCount(session([done, half, blank]))).toBe(1)
  })
})

describe('finishBlocker', () => {
  test('says it is still loading before the routine lands', () => {
    expect(finishBlocker(undefined, false)).toEqual({ reason: 'loading' })
  })

  test('names a routine with nothing in it', () => {
    expect(finishBlocker([], false)).toEqual({ reason: 'noExercises' })
  })

  // An empty quick workout has nothing to fix, only something to add, and the
  // screen says that in its own empty state.
  test('does not block an empty quick workout', () => {
    expect(finishBlocker([], true)).toBeUndefined()
  })

  test('counts the half-filled sets standing in the way', () => {
    expect(finishBlocker(session([done, half]), false)).toEqual({
      reason: 'partialSets',
      count: 1,
    })
  })

  test('asks for one logged set when nothing has been', () => {
    expect(finishBlocker(session([blank]), false)).toEqual({ reason: 'nothingLogged' })
  })

  test('is nothing at all once a set is logged and none are half done', () => {
    expect(finishBlocker(session([done, blank]), false)).toBeUndefined()
  })
})

describe('activeSetIndex', () => {
  test('is the first set still to be logged', () => {
    expect(activeSetIndex([done(), blank(), blank()], lift('e0'))).toBe(1)
  })

  test('is nothing once every set is done', () => {
    expect(activeSetIndex([done(), done()], lift('e0'))).toBe(-1)
  })
})

describe('nextUnfinishedStation', () => {
  const stations = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]

  test('is the next unfinished station below the current one', () => {
    expect(nextUnfinishedStation(stations, { a: true }, 0)).toBe(1)
  })

  test('skips the ones already completed', () => {
    expect(nextUnfinishedStation(stations, { a: true, b: true }, 0)).toBe(2)
  })

  // Working out of order still has to land somewhere useful.
  test('wraps back to an unfinished station above the current one', () => {
    expect(nextUnfinishedStation(stations, { b: true, c: true }, 1)).toBe(0)
  })

  test('is nothing once everything is done', () => {
    expect(nextUnfinishedStation(stations, { a: true, b: true, c: true }, 0)).toBe(-1)
  })
})

const circuit = (id: string, exerciseIds: string[], rests: (number | undefined)[] = []) =>
  create(RoutineGroupSchema, {
    id,
    mode: RoutineGroupMode.CIRCUIT,
    restBetweenExercisesSeconds: 15,
    restBetweenRoundsSeconds: 90,
    exercises: exerciseIds.map((exerciseId, index) => trains(exerciseId, rests[index])),
  })

const straight = (id: string, exerciseIds: string[], rests: (number | undefined)[] = []) =>
  create(RoutineGroupSchema, {
    id,
    mode: RoutineGroupMode.STRAIGHT,
    exercises: exerciseIds.map((exerciseId, index) => trains(exerciseId, rests[index])),
  })

describe('sessionGroups', () => {
  test('is one straight group when the routine has none', () => {
    const groups = sessionGroups(undefined, [lift('a'), lift('b')])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.mode).toBe('straight')
    expect(groups[0]?.stations.map((station) => station.key)).toEqual(['a', 'b'])
  })

  test('carries the settings of each group across', () => {
    const groups = sessionGroups(
      [straight('one', ['a']), circuit('two', ['b', 'c'])],
      [lift('a'), lift('b'), lift('c')],
    )

    expect(groups[1]).toMatchObject({
      mode: 'circuit',
      restBetweenExercisesSeconds: 15,
      restBetweenRoundsSeconds: 90,
    })
    expect(groups[1]?.stations.map((station) => station.exercise.id)).toEqual(['b', 'c'])
  })

  test('appends an exercise added mid-session as a straight block of its own', () => {
    const groups = sessionGroups([circuit('two', ['a'])], [lift('a'), lift('added')])

    expect(groups).toHaveLength(2)
    expect(groups[1]?.mode).toBe('straight')
    expect(groups[1]?.stations.map((station) => station.key)).toEqual(['added'])
  })

  test('drops an exercise the session no longer holds', () => {
    const groups = sessionGroups([circuit('two', ['a', 'gone'])], [lift('a')])

    expect(groups[0]?.stations.map((station) => station.key)).toEqual(['a'])
  })

  // A bench press in the warm-up and a bench press in the circuit are two
  // pieces of work, so they are two stations with two sets of sets.
  test('gives an exercise trained in two groups a key for each', () => {
    const groups = sessionGroups(
      [straight('one', ['a']), circuit('two', ['a', 'b'])],
      [lift('a'), lift('a'), lift('b')],
    )

    expect(groups[0]?.stations.map((station) => station.key)).toEqual(['a'])
    expect(groups[1]?.stations.map((station) => station.key)).toEqual(['a#2', 'b'])
  })

  // The routine is the only thing that says how long an occurrence rests, and
  // zero is an answer of its own rather than an absence.
  test('rests for the length the routine gives each occurrence', () => {
    const groups = sessionGroups(
      [straight('one', ['a', 'b', 'c'], [180, 45, 0])],
      [lift('a'), lift('b'), lift('c')],
    )

    expect(groups[0]?.stations.map((station) => station.restSeconds)).toEqual([180, 45, 0])
  })

  // A circuit rests between exercises and between rounds, so a set rest stored
  // against one of its exercises is not the session's to take.
  test('ignores a per-exercise rest in a circuit', () => {
    const groups = sessionGroups([circuit('two', ['a'], [180])], [lift('a')])

    expect(groups[0]?.stations[0]?.restSeconds).toBe(90)
  })

  // Nothing in a quick workout came from a routine, and nothing else says how
  // long to rest, so the app default does.
  test('rests for the default for anything the routine does not know about', () => {
    const groups = sessionGroups(undefined, [lift('a')])

    expect(groups[0]?.stations[0]?.restSeconds).toBe(defaultRestSeconds)
  })

  // Added mid-session, so it trails the groups the routine did describe and
  // rests for the default like a quick workout does.
  test('rests for the default for an exercise added to a routine mid-session', () => {
    const groups = sessionGroups([straight('one', ['a'], [180])], [lift('a'), lift('b')])

    expect(groups[1]?.stations.map((station) => station.restSeconds)).toEqual([defaultRestSeconds])
  })
})

describe('circuitRound', () => {
  const group = () => sessionGroups([circuit('two', ['a', 'b'])], [lift('a'), lift('b')])[0]!

  test('is the first round before anything is logged', () => {
    expect(circuitRound(group(), {})).toBe(1)
  })

  test('stays on the round until every exercise in it has been logged', () => {
    expect(circuitRound(group(), { a: 1 })).toBe(1)
    expect(circuitRound(group(), { a: 1, b: 1 })).toBe(2)
  })

  // There is no last round: a circuit goes round until the session ends it.
  test('keeps counting for as long as the circuit is worked', () => {
    expect(circuitRound(group(), { a: 9, b: 9 })).toBe(10)
  })
})

describe('nextCircuitStep', () => {
  const group = () => sessionGroups([circuit('two', ['a', 'b'])], [lift('a'), lift('b')])[0]!

  test('walks to the next exercise inside the round', () => {
    expect(nextCircuitStep(group(), 'a', 0)).toEqual({
      kind: 'nextStation',
      key: 'b',
      restSeconds: 15,
    })
  })

  test('rests for the round when the last exercise closes it', () => {
    expect(nextCircuitStep(group(), 'b', 1)).toEqual({
      kind: 'nextRound',
      key: 'a',
      round: 2,
      restSeconds: 90,
    })
  })

  // Only the session ends a circuit, so the walk itself always has a next step.
  test('starts another round however many have been taken', () => {
    expect(nextCircuitStep(group(), 'b', 9)).toEqual({
      kind: 'nextRound',
      key: 'a',
      round: 10,
      restSeconds: 90,
    })
  })

  test('finishes the group when the station is not in it', () => {
    expect(nextCircuitStep(group(), 'missing', 1)).toEqual({ kind: 'groupComplete' })
  })
})
