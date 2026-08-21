// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * This module is fifty near-identical wrappers, so the mistake it invites is a
 * copy-paste one: a new request that still calls the neighbour it was copied
 * from. Each case below pins a request to the client method it must reach.
 */
const { calls, clients, listExercises } = vi.hoisted(() => {
  const calls: string[] = []

  // listExerciseTags pages through this one, so it needs a response it can
  // read rather than the empty stub every other method gets.
  const listExercises = vi.fn()
  const overrides: Record<string, typeof listExercises> = {
    'exercise.listExercises': listExercises,
  }

  const recorder = (client: string) =>
    new Proxy(
      {},
      {
        get:
          (_target, method: string) =>
          (...args: unknown[]) => {
            const key = `${client}.${method}`
            calls.push(key)
            return overrides[key]?.(...args) ?? Promise.resolve({})
          },
      },
    )

  return {
    calls,
    listExercises,
    clients: {
      authClient: recorder('auth'),
      exerciseClient: recorder('exercise'),
      feedClient: recorder('feed'),
      notificationClient: recorder('notification'),
      routineClient: recorder('routine'),
      userClient: recorder('user'),
      workoutClient: recorder('workout'),
    },
  }
})

vi.mock('./clients', () => clients)

import { WeightUnit, DistanceUnit } from '@/proto/api/v1/shared_pb'
import * as requests from './requests'

const page = new Uint8Array(0)

const cases: Array<[string, () => Promise<unknown>]> = [
  ['auth.login', () => requests.login('a@example.com', 'pw')],
  ['auth.logout', () => requests.logout()],
  ['auth.refreshToken', () => requests.refreshToken()],
  ['auth.signup', () => requests.signup({} as never)],
  ['auth.verifyEmail', () => requests.verifyEmail('token')],
  ['auth.resendVerificationEmail', () => requests.resendVerificationEmail('a@example.com')],
  ['auth.resetPassword', () => requests.resetPassword({} as never)],
  ['auth.updatePassword', () => requests.updatePassword({} as never)],

  ['exercise.getExercise', () => requests.getExercise('e1')],
  ['exercise.createExercise', () => requests.createExercise({} as never)],
  ['exercise.updateExercise', () => requests.updateExercise({} as never)],
  ['exercise.deleteExercise', () => requests.deleteExercise('e1')],
  ['exercise.listExercises', () => requests.listExercises(page)],
  ['exercise.listSets', () => requests.listSets(['u1'], ['e1'], page)],
  ['exercise.getPersonalBests', () => requests.getPersonalBests('u1')],
  ['exercise.getPreviousWorkoutSets', () => requests.getPreviousWorkoutSets(['e1'])],

  ['routine.getRoutine', () => requests.getRoutine('r1')],
  ['routine.createRoutine', () => requests.createRoutine('Push', ['e1'])],
  ['routine.updateRoutine', () => requests.updateRoutine('r1', 'Push', ['e1'])],
  ['routine.deleteRoutine', () => requests.deleteRoutine('r1')],
  ['routine.listRoutines', () => requests.listRoutines(page)],
  ['routine.updateExerciseOrder', () => requests.updateExerciseOrder('r1', ['e1'])],
  ['routine.getPlan', () => requests.getPlan('p1')],
  ['routine.createPlan', () => requests.createPlan('Block', ['r1'])],
  ['routine.updatePlan', () => requests.updatePlan('p1', 'Block', ['r1'])],
  ['routine.deletePlan', () => requests.deletePlan('p1')],
  ['routine.listPlans', () => requests.listPlans()],
  ['routine.setActivePlan', () => requests.setActivePlan('p1')],
  ['routine.pauseActivePlan', () => requests.pauseActivePlan()],
  ['routine.skipPlanRoutine', () => requests.skipPlanRoutine('p1')],
  ['routine.getDashboard', () => requests.getDashboard('r1')],

  ['workout.getWorkout', () => requests.getWorkout('w1')],
  ['workout.createWorkout', () => requests.createWorkout({} as never)],
  ['workout.updateWorkout', () => requests.updateWorkout({} as never)],
  ['workout.deleteWorkout', () => requests.deleteWorkout('w1')],
  ['workout.listWorkouts', () => requests.listWorkouts(['u1'], page)],
  ['workout.postComment', () => requests.postWorkoutComment('w1', 'nice')],

  ['user.getUser', () => requests.getUser('u1')],
  ['user.getUser', () => requests.getCurrentUser('u1')],
  ['user.searchUsers', () => requests.searchUsers('alex', page)],
  ['user.listFollowers', () => requests.listFollowers('u1')],
  ['user.listFollowees', () => requests.listFollowees('u1')],
  ['user.followUser', () => requests.followUser('u1')],
  ['user.unfollowUser', () => requests.unfollowUser('u1')],
  ['user.updateUserUsername', () => requests.updateUserUsername('alex')],
  ['user.updateUserWeightUnit', () => requests.updateUserWeightUnit(WeightUnit.POUNDS)],
  ['user.updateUserDistanceUnit', () => requests.updateUserDistanceUnit(DistanceUnit.MILES)],
  ['user.updateUserAutofillSets', () => requests.updateUserAutofillSets(true)],

  ['feed.listFeedItems', () => requests.listFeedItems(page, true)],

  ['notification.listNotifications', () => requests.listNotifications(page)],
  ['notification.markNotificationsAsRead', () => requests.markNotificationAsRead('n1')],
]

describe('request dispatch', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it.each(cases)('reaches %s', async (expected, invoke) => {
    await invoke()

    expect(calls).toEqual([expected])
  })

  it('covers every exported request', () => {
    const exported = Object.entries(requests)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)

    // listExerciseTags composes listExercises rather than calling a client of
    // its own, so it is covered by its own case below instead.
    const untested = exported.filter((name) => name !== 'listExerciseTags')

    expect(untested).toHaveLength(cases.length)
  })
})

// Pages through every exercise to collect the tag vocabulary, so it is the one
// request in this module with logic of its own rather than a single call.
describe('listExerciseTags', () => {
  const page = (exercises: Array<{ tags: string[] }>, nextPageToken = new Uint8Array(0)) => ({
    exercises,
    pagination: { nextPageToken },
  })

  beforeEach(() => {
    calls.length = 0
    listExercises.mockReset()
  })

  it('collects the tags across every page', async () => {
    listExercises
      .mockResolvedValueOnce(page([{ tags: ['Push'] }], new Uint8Array([1])))
      .mockResolvedValueOnce(page([{ tags: ['Legs'] }]))

    await expect(requests.listExerciseTags()).resolves.toEqual(['Legs', 'Push'])
    expect(listExercises).toHaveBeenCalledTimes(2)
  })

  // Tags are user-entered, so the same tag arrives in whatever case and
  // spacing each exercise was given. The last spelling seen is the one shown —
  // a tie-break nothing depends on, pinned here so a change to it is visible.
  it('folds duplicates that differ only by case or padding', async () => {
    listExercises.mockResolvedValue(
      page([{ tags: ['Push'] }, { tags: ['push'] }, { tags: ['  PUSH  '] }]),
    )

    await expect(requests.listExerciseTags()).resolves.toEqual(['PUSH'])
  })

  it('drops tags that are only whitespace', async () => {
    listExercises.mockResolvedValue(page([{ tags: ['   ', '', 'Pull'] }]))

    await expect(requests.listExerciseTags()).resolves.toEqual(['Pull'])
  })

  // A backend that keeps returning the same token would otherwise page here
  // forever.
  it('stops when a page token repeats', async () => {
    listExercises.mockResolvedValue(page([{ tags: ['Push'] }], new Uint8Array([1])))

    await expect(requests.listExerciseTags()).resolves.toEqual(['Push'])
    expect(listExercises).toHaveBeenCalledTimes(2)
  })

  it('returns what it has when a page fails', async () => {
    listExercises
      .mockResolvedValueOnce(page([{ tags: ['Push'] }], new Uint8Array([1])))
      .mockRejectedValueOnce(new Error('offline'))

    await expect(requests.listExerciseTags()).resolves.toEqual(['Push'])
  })
})
