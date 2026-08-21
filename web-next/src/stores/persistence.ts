import type { PersistStorage, StorageValue } from 'zustand/middleware'

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
    const raw = getStorage().getItem(name)
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

  setItem: (name, value) => getStorage().setItem(name, JSON.stringify(value)),

  removeItem: (name) => getStorage().removeItem(name),
})
