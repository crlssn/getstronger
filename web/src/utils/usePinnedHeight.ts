import { useCallback } from 'react'

import { useBottomChrome } from '@/stores/bottomChrome'

/**
 * Reports an element's height to the bottom-chrome store while it is on screen.
 *
 * Measured rather than declared: a form's action bar is 76px with a button in
 * it and 107px once it is also naming what the submit is waiting for, and a
 * toast floating a constant above it covered the difference.
 *
 * Returns a ref callback, so the observation starts and stops with the node
 * rather than with an effect that has to guess when the node arrived.
 */
export const usePinnedHeight = (name: string) =>
  useCallback(
    (node: HTMLElement | null) => {
      if (!node) {
        useBottomChrome.getState().unpin(name)
        return
      }

      const report = () => useBottomChrome.getState().pin(name, node.offsetHeight)
      report()

      // jsdom has no ResizeObserver, and a spec that renders one of these is
      // not measuring anything.
      if (typeof ResizeObserver === 'undefined') return

      const observer = new ResizeObserver(report)
      observer.observe(node)
      return () => {
        observer.disconnect()
        useBottomChrome.getState().unpin(name)
      }
    },
    [name],
  )
