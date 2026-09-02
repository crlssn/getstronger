// @vitest-environment jsdom

import type { StorageValue } from 'zustand/middleware'

import { beforeEach, describe, expect, test } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { useWorkoutStore } from '@/stores/workout'
import { disposableCachePrefix, migratedStorage } from './persistence'

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

/**
 * A storage with a ceiling, the way a browser out of room behaves.
 *
 * `accepts` decides whether the next write fits, so a test can make room by
 * removing something. Reading and removing keep working throughout.
 */
const bounded = (accepts: () => boolean): Storage & { entries: Map<string, string> } => {
  const entries = new Map<string, string>()
  return {
    entries,
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size
    },
    removeItem: (key: string) => void entries.delete(key),
    setItem: (key: string, value: string) => {
      if (!accepts()) throw new DOMException('full', 'QuotaExceededError')
      entries.set(key, value)
    },
  }
}

const saved: StorageValue<Saved> = {
  state: { userId: 'user-1', accessToken: 'token' },
  version: 0,
}

// `persist` writes from inside `set`, so anything thrown here comes back out of
// the action that changed the state. Mid-workout that is every keystroke in a
// set, which is the one moment the app must not fall over.
describe('migratedStorage, out of room', () => {
  beforeEach(() => localStorage.clear())

  test('lets the update through when the write cannot land', () => {
    const storage = migratedStorage<Saved>(() => bounded(() => false))

    expect(() => storage.setItem('workouts', saved)).not.toThrow()
  })

  test('lets the update through when the storage refuses to be removed from', () => {
    const sealed = {
      ...bounded(() => false),
      removeItem: () => {
        throw new Error('denied')
      },
    } as Storage

    expect(() => migratedStorage<Saved>(() => sealed).removeItem('workouts')).not.toThrow()
  })

  test('reads nothing rather than throwing when the storage refuses to be read', () => {
    const sealed = {
      ...bounded(() => true),
      getItem: () => {
        throw new Error('denied')
      },
    } as Storage

    expect(migratedStorage<Saved>(() => sealed).getItem('auth')).toBeNull()
  })

  // A cached response can be fetched again; a workout in progress cannot. So
  // the cache is what gives up its room.
  test('drops the cached responses to make room for the write', () => {
    let full = true
    const storage = bounded(() => !full)
    storage.entries.set(`${disposableCachePrefix}user-1:ListExercises`, 'stale')
    storage.entries.set('unrelated', 'kept')
    // Room appears the moment anything is let go of.
    const remove = storage.removeItem.bind(storage)
    storage.removeItem = (key: string) => {
      remove(key)
      full = false
    }

    migratedStorage<Saved>(() => storage).setItem('workouts', saved)

    expect(JSON.parse(storage.entries.get('workouts') ?? '')).toHaveProperty('state')
    expect(storage.entries.has(`${disposableCachePrefix}user-1:ListExercises`)).toBe(false)
    expect(storage.entries.get('unrelated')).toBe('kept')
  })
})
