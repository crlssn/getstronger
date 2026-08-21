import { Capacitor } from '@capacitor/core'
import { create } from 'zustand'

/** How often to re-check while the tab is open. */
const pollIntervalMs = 5 * 60 * 1000

/**
 * A deploy is worth prompting about only if we know both versions and they
 * differ. A missing or malformed response means "no idea", never "outdated".
 */
export const isOutdated = (running: string, latest: unknown) =>
  typeof latest === 'string' && latest !== '' && running !== '' && latest !== running

export const fetchDeployedVersion = async (): Promise<string | undefined> => {
  try {
    // Bypass any CDN or browser cache: a stale read defeats the whole point.
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return undefined

    const body: unknown = await response.json()
    const version = (body as { version?: unknown } | null)?.version
    return typeof version === 'string' ? version : undefined
  } catch {
    // Offline or blocked; try again on the next tick.
    return undefined
  }
}

interface AppVersionState {
  runningVersion: string
  updateAvailable: boolean
  dismissedVersion: string
  check: () => Promise<void>
  dismiss: () => Promise<void>
  refresh: () => void
  start: () => void
  stop: () => void
}

// Not state: nothing renders from them, and putting a timer handle in the store
// would make every subscriber re-render when polling starts.
let timer: ReturnType<typeof setInterval> | undefined

export const useAppVersionStore = create<AppVersionState>()((set, get) => {
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void get().check()
  }

  return {
    runningVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
    updateAvailable: false,
    dismissedVersion: '',

    check: async () => {
      const latest = await fetchDeployedVersion()
      if (!isOutdated(get().runningVersion, latest)) return
      // Re-prompt if a further deploy lands after one was dismissed.
      set({ updateAvailable: latest !== get().dismissedVersion })
    },

    dismiss: async () => {
      set({ dismissedVersion: (await fetchDeployedVersion()) ?? '', updateAvailable: false })
    },

    refresh: () => window.location.reload(),

    start: () => {
      // Dev serves no version.json, and hot reload covers the same ground.
      if (!import.meta.env.PROD || timer) return
      // Native builds ship their assets inside the binary: a web deploy does not
      // change what is running, so prompting to "refresh" would mislead. An
      // app-store update hint is a possible follow-up.
      if (Capacitor.isNativePlatform()) return

      void get().check()
      timer = setInterval(() => void get().check(), pollIntervalMs)
      // Returning to a tab left open for hours is the likeliest moment to be
      // running a build that no longer exists.
      document.addEventListener('visibilitychange', onVisibilityChange)
    },

    stop: () => {
      if (timer) clearInterval(timer)
      timer = undefined
      document.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
})
