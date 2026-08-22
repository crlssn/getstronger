// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from 'vitest'

import { WeightUnit } from '@/proto/api/v1/shared_pb'
import { clearAccountState } from '@/stores/accountState'
import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useEmailVerificationStore } from '@/stores/emailVerification'
import { useMutationQueueStore } from '@/stores/mutationQueue'
import { usePreferencesStore } from '@/stores/preferences'
import { useWorkoutStore } from '@/stores/workout'

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
    useMutationQueueStore.setState({
      pending: [
        { method: 'CreateWorkout', request: '{}', queuedAt: new Date(0).toISOString() },
      ],
    })
    useWorkoutStore.getState().initialiseWorkout('routine-1')

    clearAccountState()

    expect(useAuthStore.getState().userId).toBe('')
    expect(useAuthStore.getState().accessToken).toBe('')
    expect(usePreferencesStore.getState().weightUnit).toBe(WeightUnit.KILOGRAMS)
    expect(useDashboardStore.getState().preferredRoutineId).toBe('')
    expect(useEmailVerificationStore.getState().pendingEmail).toBe('')
    expect(useMutationQueueStore.getState().pending).toEqual([])
    expect(useWorkoutStore.getState().workouts).toEqual({})
  })
})
