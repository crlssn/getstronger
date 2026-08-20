import type { Router } from 'vue-router'

/**
 * Imports every lazy route component so navigation keeps working when the
 * network later disappears: an unvisited route's chunk cannot be fetched
 * offline, which would abort the navigation. Call it once the app has
 * settled; failures are ignored because the route can still load on demand.
 */
export const warmLazyRoutes = async (router: Router): Promise<void> => {
  const loads: Promise<unknown>[] = []
  for (const route of router.getRoutes()) {
    for (const component of Object.values(route.components ?? {})) {
      if (typeof component === 'function') {
        loads.push(Promise.resolve((component as () => unknown)()).catch(() => undefined))
      }
    }
  }
  await Promise.all(loads)
}

/** Schedules warmLazyRoutes for when the browser is idle. */
export const warmLazyRoutesWhenIdle = (router: Router): void => {
  const warm = () => void warmLazyRoutes(router)
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warm)
  } else {
    setTimeout(warm, 1_000)
  }
}
