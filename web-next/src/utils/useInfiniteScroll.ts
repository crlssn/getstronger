import { useEffect, useRef } from 'react'

/**
 * Calls `onIntersect` once whenever the returned ref's element scrolls into
 * view, as long as `enabled` is true. Replaces `v-infinite-scroll` from
 * `@vueuse/components`, which has no React equivalent.
 *
 * The callback is read from a ref rather than a hook dependency, so passing a
 * fresh closure on every render — the common case for an inline handler —
 * does not tear down and recreate the observer.
 */
export const useInfiniteScroll = <T extends HTMLElement>(
  onIntersect: () => void,
  enabled: boolean,
) => {
  const sentinelRef = useRef<T | null>(null)
  const callback = useRef(onIntersect)

  // Keeps the ref in sync without mutating it during render, which React
  // refs are not allowed to be.
  useEffect(() => {
    callback.current = onIntersect
  })

  useEffect(() => {
    if (!enabled) return undefined
    const node = sentinelRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return undefined

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) callback.current()
    })
    observer.observe(node)

    return () => observer.disconnect()
  }, [enabled])

  return sentinelRef
}
