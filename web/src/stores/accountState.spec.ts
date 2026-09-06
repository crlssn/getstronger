// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { logoutUnauthenticatedUser } from '@/http/unauthenticated'
import { WeightUnit } from '@/proto/api/v1/shared_pb'
import { setNavigator } from '@/router/navigation'
import { clearAccountState, startAccountSession } from '@/stores/accountState'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useEmailVerificationStore } from '@/stores/emailVerification'
import { useMutationQueueStore } from '@/stores/mutationQueue'
import { disposableCachePrefix } from '@/stores/persistence'
import { usePreferencesStore } from '@/stores/preferences'
import { quickWorkoutRoutineID, useWorkoutStore } from '@/stores/workout'

const queuedWorkout = {
  method: 'CreateWorkout',
  request: '{}',
  queuedAt: new Date(0).toISOString(),
}

describe('clearAccountState', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  test('leaves nothing of the account behind', () => {
    useAuthStore.setState({ userId: 'user-1', accessToken: 'token' })
    usePreferencesStore.getState().setWeightUnit(WeightUnit.POUNDS)
    useDashboardStore.setState({ preferredRoutineId: 'routine-1' })
    useEmailVerificationStore.getState().setPendingEmail('lifter@example.com')
    useMutationQueueStore.setState({ pending: [queuedWorkout] })
    useWorkoutStore.getState().initialiseWorkout('routine-1')
    localStorage.setItem(`${disposableCachePrefix}user-1:UserService.GetUser:{}`, '{}')

    clearAccountState()

    expect(useAuthStore.getState().userId).toBe('')
    expect(useAuthStore.getState().accessToken).toBe('')
    expect(usePreferencesStore.getState().weightUnit).toBe(WeightUnit.KILOGRAMS)
    expect(useDashboardStore.getState().preferredRoutineId).toBe('')
    expect(useEmailVerificationStore.getState().pendingEmail).toBe('')
    expect(useMutationQueueStore.getState().pending).toEqual([])
    expect(useWorkoutStore.getState().workouts).toEqual({})
    expect(localStorage.getItem(`${disposableCachePrefix}user-1:UserService.GetUser:{}`)).toBeNull()
  })
})

// Signing out leaves the drafts, the queue and the cached reads on the device,
// because the same person usually comes back for them. The next account to
// sign in is the device changing hands.
describe('startAccountSession', () => {
  // Nothing verifies the signature here; only the payload is read.
  const tokenFor = (userId: string) =>
    `header.${btoa(JSON.stringify({ userId })).replace(/=+$/, '')}.signature`

  const cachedRead = `${disposableCachePrefix}athlete-a:UserService.GetUser:{}`

  const trainAndSignOut = () => {
    startAccountSession(tokenFor('athlete-a'))
    useWorkoutStore.getState().initialiseWorkout('routine-of-athlete-a')
    useWorkoutStore.getState().initialiseWorkout(quickWorkoutRoutineID)
    useMutationQueueStore.setState({ pending: [queuedWorkout] })
    localStorage.setItem(cachedRead, '{"email":"athlete-a@example.com"}')
  }

  // What the device is still holding for whoever signed out.
  const deviceHolds = () => ({
    drafts: Object.keys(useWorkoutStore.getState().workouts).sort(),
    queued: useMutationQueueStore.getState().pending.length,
    cached: localStorage.getItem(cachedRead),
  })

  const workOfAthleteA = {
    drafts: [quickWorkoutRoutineID, 'routine-of-athlete-a'].sort(),
    queued: 1,
    cached: '{"email":"athlete-a@example.com"}',
  }

  const nothing = { drafts: [], queued: 0, cached: null }

  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ userId: '', accessToken: '', lastUserId: '' })
    useWorkoutStore.setState({ workouts: {} })
    useMutationQueueStore.setState({ pending: [] })
    // A dead session redirects to the login screen on its way out.
    setNavigator(vi.fn())
  })

  afterEach(() => setNavigator(undefined))

  test('hands a different athlete a device with nothing on it', () => {
    trainAndSignOut()
    useAuthStore.getState().logout()

    startAccountSession(tokenFor('athlete-b'))

    expect(deviceHolds()).toEqual(nothing)
    expect(useAuthStore.getState().userId).toBe('athlete-b')
  })

  test('gives the same athlete their work back', () => {
    trainAndSignOut()
    useAuthStore.getState().logout()

    startAccountSession(tokenFor('athlete-a'))

    expect(deviceHolds()).toEqual(workOfAthleteA)
    expect(useAuthStore.getState().userId).toBe('athlete-a')
  })

  // The session a signed-in athlete never ends themselves: an expired refresh
  // token, or a password reset that revoked it.
  test('covers the sign-out a dead session takes', async () => {
    trainAndSignOut()

    await logoutUnauthenticatedUser()
    startAccountSession(tokenFor('athlete-b'))

    expect(deviceHolds()).toEqual(nothing)
  })

  test('leaves a session being refreshed alone', () => {
    trainAndSignOut()

    startAccountSession(tokenFor('athlete-a'))

    expect(deviceHolds()).toEqual(workOfAthleteA)
  })
})
