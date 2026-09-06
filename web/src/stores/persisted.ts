import { useAuthStore } from '@/stores/auth'
import { useDashboardStore } from '@/stores/dashboard'
import { useEmailVerificationStore } from '@/stores/emailVerification'
import { useLocaleStore } from '@/stores/locale'
import { useMutationQueueStore } from '@/stores/mutationQueue'
import { usePreferencesStore } from '@/stores/preferences'
import { useWorkoutStore } from '@/stores/workout'

/** Just enough of `persist`'s API to know when a store has finished reading. */
interface Persisted {
  persist: {
    hasHydrated: () => boolean
    onFinishHydration: (listener: () => void) => () => void
  }
}

/** Every store that persists, so the app can wait for all of them at once. */
export const persistedStores: readonly Persisted[] = [
  useAuthStore,
  useDashboardStore,
  useEmailVerificationStore,
  useLocaleStore,
  useMutationQueueStore,
  usePreferencesStore,
  useWorkoutStore,
]

const hydrated = (store: Persisted): Promise<void> =>
  store.persist.hasHydrated()
    ? Promise.resolve()
    : new Promise((resolve) => {
        const done = store.persist.onFinishHydration(() => {
          done()
          resolve()
        })
      })

/**
 * Resolves once every persisted store has read what it kept.
 *
 * On the web `persist` reads `localStorage` synchronously and this resolves at
 * once. Inside the native app the read goes through the OS and lands a tick
 * later, while the access guards and the locale read a store the moment they
 * run: a signed-in user would be sent to login, and the first screen would
 * paint in the device's language. So the app boots after this, not before.
 */
export const rehydrated = (stores: readonly Persisted[] = persistedStores): Promise<void> =>
  Promise.all(stores.map(hydrated)).then(() => undefined)
