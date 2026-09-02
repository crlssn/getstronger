import type { PersistStorage, StorageValue } from 'zustand/middleware'

/**
 * Namespaces the responses `http/offlineCache.ts` keeps for reading offline.
 *
 * It lives here because this is where the room they take is reclaimed, and a
 * prefix only one side of that agreed on would reclaim nothing.
 */
export const disposableCachePrefix = 'offlineCache:'

/**
 * Lets go of every cached response, which is the only thing in storage that can
 * always be fetched again.
 */
export const dropDisposableCache = (storage: Storage = localStorage): void => {
  try {
    const doomed: string[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key?.startsWith(disposableCachePrefix)) doomed.push(key)
    }
    doomed.forEach((key) => storage.removeItem(key))
  } catch {
    // An unavailable storage holds nothing worth clearing.
  }
}

/**
 * Storage for `persist` that can also read what the Vue app left behind.
 *
 * `pinia-plugin-persistedstate` wrote a store's state bare under its id;
 * Zustand's `persist` wraps it as `{ state, version }` under the same name. The
 * six persisted stores use the same keys in both apps, so on the deploy that
 * swaps them over the first read finds the old shape. Without this every one of
 * them silently falls back to defaults — which signs the user out, drops the
 * offline queue, and throws away a workout in progress.
 *
 * A value the Vue app wrote is recognised by having no `state` key. None of the
 * six has a field of that name, and once one has been read it is written back
 * in the new shape, so a browser only ever takes this path once.
 *
 * Safe to delete when no deployed client can still be carrying Vue-written
 * keys.
 */
export const migratedStorage = <T>(
  getStorage: () => Storage = () => localStorage,
): PersistStorage<T> => ({
  getItem: (name) => {
    let raw: string | null
    try {
      raw = getStorage().getItem(name)
    } catch {
      // A storage that will not be read holds nothing to start from.
      return null
    }
    if (!raw) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // A key that is not JSON is not ours to interpret; starting from the
      // defaults is better than refusing to start.
      return null
    }

    if (typeof parsed !== 'object' || parsed === null) return null
    if ('state' in parsed) return parsed as StorageValue<T>

    return { state: parsed as T, version: 0 }
  },

  // `persist` writes from inside `set`, so a storage that refuses the write
  // throws out of whatever action changed the state — mid-workout, that is
  // every keystroke in a set. Nothing here is worth dropping a rep over.
  setItem: (name, value) => {
    const storage = getStorage()
    const raw = JSON.stringify(value)
    try {
      storage.setItem(name, raw)
    } catch {
      // Out of room. A cached response can be fetched again and a workout in
      // progress cannot, so the cache is what gives up its space.
      try {
        dropDisposableCache(storage)
        storage.setItem(name, raw)
      } catch {
        // Nothing left to give: this device stops persisting rather than
        // stopping the user.
      }
    }
  },

  removeItem: (name) => {
    try {
      getStorage().removeItem(name)
    } catch {
      // A storage that will not be written to is already not holding this.
    }
  },
})
