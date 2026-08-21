import { screens } from '@/router/screens'

/**
 * Imports every lazy screen so navigation keeps working once the network
 * disappears.
 *
 * An unvisited route's chunk cannot be fetched offline, and a navigation that
 * cannot fetch its chunk aborts. Call this after the app has settled; failures
 * are ignored, because the route can still load on demand.
 */
export const warmLazyRoutes = async (): Promise<void> => {
  await Promise.all(Object.values(screens).map((load) => load?.().catch(() => undefined)))
}

/** Schedules `warmLazyRoutes` for the next moment the browser is idle. */
export const warmLazyRoutesWhenIdle = (): void => {
  const warm = () => void warmLazyRoutes()

  if ('requestIdleCallback' in window) window.requestIdleCallback(warm)
  else setTimeout(warm, 1_000)
}
