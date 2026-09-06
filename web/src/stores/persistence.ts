import type { PersistStorage, StorageValue } from 'zustand/middleware'

import { Capacitor } from '@capacitor/core'

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
 * Reads a stored value in either of the two shapes it has ever been written in.
 *
 * `pinia-plugin-persistedstate` wrote a store's state bare under its id;
 * Zustand's `persist` wraps it as `{ state, version }` under the same name. A
 * value the Vue app wrote is recognised by having no `state` key: none of the
 * persisted stores has a field of that name.
 */
const readStored = <T>(raw: string | null): StorageValue<T> | null => {
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
}

const webViewStorage = <T>(getStorage: () => Storage): PersistStorage<T> => ({
  getItem: (name) => {
    try {
      return readStored<T>(getStorage().getItem(name))
    } catch {
      // A storage that will not be read holds nothing to start from.
      return null
    }
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

/**
 * Keeps a store in the OS's own key-value store rather than in the WebView.
 *
 * Inside the app, `localStorage` is website data: iOS clears it under storage
 * pressure and an offloaded app loses it outright, and neither asks first. The
 * Preferences plugin writes to UserDefaults and SharedPreferences, which are
 * app data and survive both.
 *
 * The plugin has no synchronous read, so every store rehydrates a tick after it
 * is created; `rehydrated` in `persisted.ts` is what the app waits on. The
 * plugin module is imported on first use so browser bundles never execute it.
 */
const nativeStorage = <T>(webView: PersistStorage<T>): PersistStorage<T> => {
  // The module rather than the plugin: a Capacitor plugin is a proxy that
  // rejects any method it does not know, and resolving one through a promise
  // asks it for `then`.
  const plugin = () => import('@capacitor/preferences')

  // The bridge finishes calls in whatever order the OS gets to them, and the
  // workout draft is rewritten on every keystroke in a set. Writes to one key
  // are chained so the last one made is the last one to land.
  const chains = new Map<string, Promise<unknown>>()
  const inOrder = <R>(name: string, write: () => Promise<R>): Promise<R> => {
    const next = (chains.get(name) ?? Promise.resolve()).then(write, write)
    chains.set(name, next)
    return next
  }

  const write = (name: string, value: StorageValue<T>): Promise<boolean> =>
    inOrder(name, async () => {
      try {
        await (await plugin()).Preferences.set({ key: name, value: JSON.stringify(value) })
        return true
      } catch {
        // `persist` writes from inside `set`, and a rejection here would
        // surface as an unhandled one on every keystroke. This device stops
        // persisting rather than stopping the user.
        return false
      }
    })

  return {
    getItem: async (name) => {
      try {
        const found = readStored<T>((await (await plugin()).Preferences.get({ key: name })).value)
        if (found) return found
      } catch {
        // A plugin that will not answer holds nothing to start from; the
        // WebView still might.
      }

      // Nothing of ours yet, which is what the first launch after the build
      // that kept every store in the WebView sees. Treating it as a fresh
      // install would sign the user out and drop their draft, so what the
      // WebView holds is picked up and moved out of the OS's reach. The old
      // copy goes only once the new one has landed.
      const left = await webView.getItem(name)
      if (left && (await write(name, left))) await webView.removeItem(name)
      return left
    },

    setItem: async (name, value) => {
      await write(name, value)
    },

    removeItem: (name) =>
      inOrder(name, async () => {
        try {
          await (await plugin()).Preferences.remove({ key: name })
        } catch {
          // A store that will not be written to is already not holding this.
        }
      }),
  }
}

/**
 * Storage for `persist` that can also read what the Vue app left behind.
 *
 * The persisted stores use the same keys in both apps, so on the deploy that
 * swaps them over the first read finds the old shape. Without this every one of
 * them silently falls back to defaults — which signs the user out, drops the
 * offline queue, and throws away a workout in progress. Once a value has been
 * read it is written back in the new shape, so a browser only ever takes this
 * path once. Safe to delete when no deployed client can still be carrying
 * Vue-written keys.
 *
 * On the web that is `localStorage`, or whatever `getStorage` returns. Inside
 * the native app the store lives with the OS instead, and `getStorage` only
 * names where an earlier build left it.
 */
export const migratedStorage = <T>(
  getStorage: () => Storage = () => localStorage,
): PersistStorage<T> => {
  const webView = webViewStorage<T>(getStorage)
  return Capacitor.isNativePlatform() ? nativeStorage(webView) : webView
}
