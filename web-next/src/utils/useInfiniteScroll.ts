import { useEffect, useRef } from 'react'

/**
 * Calls `onReach` while the returned ref's element is in view.
 *
 * Replaces `vInfiniteScroll` from `@vueuse/components`, which has no React
 * equivalent. The element is a sentinel at the end of a list: seeing it means
 * the reader has run out of rows.
 *
 * `onReach` is held in a ref rather than listed as an effect dependency. A
 * caller usually passes an inline function, so depending on it would tear down
 * and rebuild the observer on every render — and rebuilding it fires the
 * callback again immediately, which is a fetch loop.
 */
export const useInfiniteScroll = <T extends Element>(
  onReach: () => void,
  enabled = true,
): React.RefObject<T | null> => {
  const sentinel = useRef<T>(null)
  const handler = useRef(onReach)

  // No dependency array: this runs after every render, so the ref always holds
  // the latest callback. Writing it during render instead would be a mutation
  // in a phase React may replay.
  useEffect(() => {
    handler.current = onReach
  })

  useEffect(() => {
    const element = sentinel.current
    if (!enabled || !element) return
    // jsdom has no IntersectionObserver unless a test provides one, and a
    // list that cannot page is better than a crash.
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) handler.current()
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled])

  return sentinel
}
