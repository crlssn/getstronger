// @vitest-environment jsdom

import type { StorageValue } from 'zustand/middleware'

import { beforeEach, describe, expect, test } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { useWorkoutStore } from '@/stores/workout'
import { migratedStorage } from './persistence'

interface Saved {
  userId: string
  accessToken: string
}

const storage = migratedStorage<Saved>()

describe('migratedStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  test('reads back what it wrote', () => {
    storage.setItem('auth', { state: { userId: 'user-1', accessToken: 'token' }, version: 0 })

    expect(storage.getItem('auth')).toEqual({
      state: { userId: 'user-1', accessToken: 'token' },
      version: 0,
    })
  })

  // The Vue app wrote the state bare under the store's id. Reading it as if it
  // were absent would sign every user out on the deploy that swaps the apps.
  test('wraps a value the Vue app left behind', () => {
    localStorage.setItem('auth', JSON.stringify({ userId: 'user-1', accessToken: 'token' }))

    expect(storage.getItem('auth')).toEqual({
      state: { userId: 'user-1', accessToken: 'token' },
      version: 0,
    })
  })

  test('takes the old shape only once', () => {
    localStorage.setItem('auth', JSON.stringify({ userId: 'user-1', accessToken: 'token' }))

    const migrated = storage.getItem('auth') as StorageValue<Saved>
    storage.setItem('auth', migrated)

    expect(JSON.parse(localStorage.getItem('auth') ?? '')).toHaveProperty('state')
  })

  test('says nothing is there when nothing is', () => {
    expect(storage.getItem('auth')).toBeNull()
  })

  // Starting from the defaults beats refusing to start.
  test.each([['not json'], ['"a string"'], ['null'], ['42']])('ignores a key holding %s', (raw) => {
    localStorage.setItem('auth', raw)

    expect(storage.getItem('auth')).toBeNull()
  })

  test('removes a key', () => {
    storage.setItem('auth', { state: { userId: 'user-1', accessToken: 't' }, version: 0 })
    storage.removeItem('auth')

    expect(localStorage.getItem('auth')).toBeNull()
  })

  // What the wrapping is for, on the two stores where losing it would cost the
  // user something they cannot get back.
  test('carries a session written by the Vue app across the swap', async () => {
    localStorage.setItem('auth', JSON.stringify({ userId: 'user-1', accessToken: 'token' }))

    await useAuthStore.persist.rehydrate()

    expect(useAuthStore.getState().userId).toBe('user-1')
    expect(useAuthStore.getState().accessToken).toBe('token')
  })

  test('carries a workout in progress across the swap', async () => {
    localStorage.setItem(
      'workouts',
      JSON.stringify({ workouts: { 'routine-1': { startedAt: '2026-08-16T12:00:00Z' } } }),
    )

    await useWorkoutStore.persist.rehydrate()

    expect(useWorkoutStore.getState().workouts['routine-1']?.startedAt).toBe('2026-08-16T12:00:00Z')
  })

  // The email-verification store is per tab in both apps.
  test('can be pointed at another storage', () => {
    const perTab = migratedStorage<Saved>(() => sessionStorage)
    perTab.setItem('auth', { state: { userId: 'user-1', accessToken: 't' }, version: 0 })

    expect(sessionStorage.getItem('auth')).not.toBeNull()
    expect(localStorage.getItem('auth')).toBeNull()
  })
})
