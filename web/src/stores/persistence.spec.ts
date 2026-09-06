// @vitest-environment jsdom

import type { StorageValue } from 'zustand/middleware'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  native: false,
  entries: new Map<string, string>(),
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: bridge.get, set: bridge.set, remove: bridge.remove },
}))

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

// Inside the native app the same adapter keeps everything in the OS's own
// key-value store, which — unlike the WebView's `localStorage` — iOS never
// clears to free up room.
describe('migratedStorage, inside the native app', () => {
  beforeEach(() => {
    bridge.native = true
    bridge.entries.clear()
    bridge.get.mockReset()
    bridge.set.mockReset()
    bridge.remove.mockReset()
    bridge.get.mockImplementation(({ key }: { key: string }) =>
      Promise.resolve({ value: bridge.entries.get(key) ?? null }),
    )
    bridge.set.mockImplementation(({ key, value }: { key: string; value: string }) => {
      bridge.entries.set(key, value)
      return Promise.resolve()
    })
    bridge.remove.mockImplementation(({ key }: { key: string }) => {
      bridge.entries.delete(key)
      return Promise.resolve()
    })
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    bridge.native = false
  })

  test('keeps what it writes out of the WebView', async () => {
    const native = migratedStorage<Saved>()

    await native.setItem('auth', saved)

    expect(JSON.parse(bridge.entries.get('auth') ?? '')).toEqual(saved)
    expect(localStorage.getItem('auth')).toBeNull()
    expect(await native.getItem('auth')).toEqual(saved)
  })

  test('says nothing is there when nothing is', async () => {
    expect(await migratedStorage<Saved>().getItem('auth')).toBeNull()
  })

  test.each([['not json'], ['"a string"'], ['null'], ['42']])(
    'ignores a key holding %s',
    async (raw) => {
      bridge.entries.set('auth', raw)

      expect(await migratedStorage<Saved>().getItem('auth')).toBeNull()
    },
  )

  // The build before this one kept every store in the WebView. Its first
  // launch finds nothing in the app's own storage, and must not treat that as
  // a fresh install: that would sign the user out and drop their draft.
  test('carries what the last build left in the WebView across', async () => {
    localStorage.setItem('auth', JSON.stringify(saved))

    expect(await migratedStorage<Saved>().getItem('auth')).toEqual(saved)
    expect(JSON.parse(bridge.entries.get('auth') ?? '')).toEqual(saved)
    expect(localStorage.getItem('auth')).toBeNull()
  })

  test('wraps a value the Vue app left behind in the WebView', async () => {
    localStorage.setItem('auth', JSON.stringify(saved.state))

    expect(await migratedStorage<Saved>().getItem('auth')).toEqual(saved)
    expect(JSON.parse(bridge.entries.get('auth') ?? '')).toEqual(saved)
  })

  test('leaves the WebView copy alone until the move has landed', async () => {
    bridge.set.mockRejectedValue(new Error('denied'))
    localStorage.setItem('auth', JSON.stringify(saved))

    expect(await migratedStorage<Saved>().getItem('auth')).toEqual(saved)
    expect(localStorage.getItem('auth')).not.toBeNull()
  })

  test('prefers its own copy over a stale one in the WebView', async () => {
    bridge.entries.set('auth', JSON.stringify(saved))
    localStorage.setItem(
      'auth',
      JSON.stringify({ state: { userId: 'user-2', accessToken: 'old' }, version: 0 }),
    )

    expect(await migratedStorage<Saved>().getItem('auth')).toEqual(saved)
  })

  test('can be pointed at another WebView storage to move from', async () => {
    sessionStorage.setItem('emailVerification', JSON.stringify(saved))

    expect(await migratedStorage<Saved>(() => sessionStorage).getItem('emailVerification')).toEqual(
      saved,
    )
    expect(sessionStorage.getItem('emailVerification')).toBeNull()
  })

  test('removes a key', async () => {
    bridge.entries.set('auth', JSON.stringify(saved))

    await migratedStorage<Saved>().removeItem('auth')

    expect(bridge.entries.has('auth')).toBe(false)
  })

  // The bridge answers calls in the order it finishes them, not the order
  // they were made, and the draft is rewritten on every keystroke in a set.
  test('lands writes to one key in the order they were made', async () => {
    let releaseFirst = () => {}
    bridge.set.mockImplementationOnce(
      ({ key, value }: { key: string; value: string }) =>
        new Promise<void>((resolve) => {
          releaseFirst = () => {
            bridge.entries.set(key, value)
            resolve()
          }
        }),
    )
    const native = migratedStorage<Saved>()

    const first = native.setItem('workouts', saved)
    const second = native.setItem('workouts', {
      state: { userId: 'user-1', accessToken: 'newer' },
      version: 0,
    })
    await vi.waitFor(() => expect(bridge.set).toHaveBeenCalledOnce())
    releaseFirst()
    await Promise.all([first, second])

    expect(JSON.parse(bridge.entries.get('workouts') ?? '')).toEqual({
      state: { userId: 'user-1', accessToken: 'newer' },
      version: 0,
    })
  })

  // `persist` writes from inside `set`; a rejection here would surface as an
  // unhandled one on every keystroke.
  test('lets the update through when the plugin refuses the write', async () => {
    bridge.set.mockRejectedValue(new Error('denied'))

    await expect(migratedStorage<Saved>().setItem('workouts', saved)).resolves.toBeUndefined()
  })

  test('lets the update through when the plugin refuses the removal', async () => {
    bridge.remove.mockRejectedValue(new Error('denied'))

    await expect(migratedStorage<Saved>().removeItem('workouts')).resolves.toBeUndefined()
  })

  test('reads from the WebView when the plugin refuses to answer', async () => {
    bridge.get.mockRejectedValue(new Error('denied'))
    localStorage.setItem('auth', JSON.stringify(saved))

    expect(await migratedStorage<Saved>().getItem('auth')).toEqual(saved)
  })

  // The whole path, on the store where a lost read costs a sign-out.
  test('rehydrates a store from the app storage', async () => {
    bridge.entries.set('auth', JSON.stringify(saved))
    useAuthStore.persist.setOptions({ storage: migratedStorage() })

    await useAuthStore.persist.rehydrate()

    expect(useAuthStore.getState().userId).toBe('user-1')
    expect(useAuthStore.getState().accessToken).toBe('token')
    useAuthStore.setState({ userId: '', accessToken: '' })
    bridge.native = false
    useAuthStore.persist.setOptions({ storage: migratedStorage() })
  })
})
