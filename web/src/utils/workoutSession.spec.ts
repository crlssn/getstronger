import type { SessionExercise } from './workoutSession'

import { create } from '@bufbuild/protobuf'
import { describe, expect, test } from 'vitest'

import { ExerciseMetric, ExerciseSchema } from '@/proto/api/v1/shared_pb'
import {
  activeSetIndex,
  elapsedLabel,
  finishBlocker,
  incompleteSetCount,
  loggedSetCount,
  nextUnfinishedIndex,
} from './workoutSession'

const lift = (id: string) =>
  create(ExerciseSchema, { id, name: id, metrics: [ExerciseMetric.WEIGHT, ExerciseMetric.REPS] })

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

describe('nextUnfinishedIndex', () => {
  const exercises = [lift('a'), lift('b'), lift('c')]

  test('is the next unfinished exercise below the current one', () => {
    expect(nextUnfinishedIndex(exercises, { a: true }, 0)).toBe(1)
  })

  test('skips the ones already completed', () => {
    expect(nextUnfinishedIndex(exercises, { a: true, b: true }, 0)).toBe(2)
  })

  // Working out of order still has to land somewhere useful.
  test('wraps back to an unfinished exercise above the current one', () => {
    expect(nextUnfinishedIndex(exercises, { b: true, c: true }, 1)).toBe(0)
  })

  test('is nothing once everything is done', () => {
    expect(nextUnfinishedIndex(exercises, { a: true, b: true, c: true }, 0)).toBe(-1)
  })
})
