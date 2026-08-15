import { ref } from 'vue'
import { defineStore } from 'pinia'

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

export const useAppVersionStore = defineStore('appVersion', () => {
  const runningVersion = ref(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '')
  const updateAvailable = ref(false)
  const dismissedVersion = ref('')
  let timer: ReturnType<typeof setInterval> | undefined

  const check = async () => {
    const latest = await fetchDeployedVersion()
    if (!isOutdated(runningVersion.value, latest)) return
    // Re-prompt if a further deploy lands after one was dismissed.
    updateAvailable.value = latest !== dismissedVersion.value
  }

  const dismiss = async () => {
    dismissedVersion.value = (await fetchDeployedVersion()) ?? ''
    updateAvailable.value = false
  }

  const refresh = () => window.location.reload()

  const start = () => {
    // Dev serves no version.json, and hot reload covers the same ground.
    if (!import.meta.env.PROD || timer) return

    void check()
    timer = setInterval(() => void check(), pollIntervalMs)
    // Returning to a tab left open for hours is the likeliest moment to be
    // running a build that no longer exists.
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void check()
  }

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = undefined
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  return { check, dismiss, refresh, runningVersion, start, stop, updateAvailable }
})
