/**
 * Wraps a task so concurrent callers share one run of it.
 *
 * The callers here are usually components mounting together, or requests
 * failing together: several ask for the same work in the same tick, and only
 * the first should reach the network. Once a run settles the next call starts
 * a fresh one, so this caches nothing — a caller that also wants the *result*
 * kept needs its own `loaded` flag on top.
 */
export const singleFlight = <T>(task: () => Promise<T>): (() => Promise<T>) => {
  let inFlight: Promise<T> | undefined

  return () =>
    (inFlight ??= task().finally(() => {
      inFlight = undefined
    }))
}
