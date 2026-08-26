import type { RefObject } from 'react'

import { useCallback, useEffect, useState } from 'react'

/** Sub-pixel layout leaves a fraction of a pixel over on boxes that do fit. */
const slack = 1

export interface OverflowEdges {
  /** Content is hidden past the near edge. */
  start: boolean
  /** Content is hidden past the far edge. */
  end: boolean
}

/**
 * Which edges of a horizontal scroller have more content past them.
 *
 * A row that simply ends at its container reads as clipped — a segmented
 * control whose last label is cut mid-word looks like a rendering fault rather
 * than something to swipe. Knowing which side is hiding something is what lets
 * the control fade that edge and say so.
 */
export const useOverflowEdges = (ref: RefObject<HTMLElement | null>): OverflowEdges => {
  const [edges, setEdges] = useState<OverflowEdges>({ start: false, end: false })

  const read = useCallback(() => {
    const element = ref.current
    if (!element) return

    const { scrollLeft, scrollWidth, clientWidth } = element
    // Right-to-left scrolls negative, so the distance is what matters.
    const offset = Math.abs(scrollLeft)

    setEdges((current) => {
      const next = {
        start: offset > slack,
        end: offset + clientWidth < scrollWidth - slack,
      }
      return current.start === next.start && current.end === next.end ? current : next
    })
  }, [ref])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    read()
    element.addEventListener('scroll', read, { passive: true })

    // The row also stops overflowing when the window widens or the options
    // change, neither of which fires a scroll event.
    const observer = new ResizeObserver(read)
    observer.observe(element)

    return () => {
      element.removeEventListener('scroll', read)
      observer.disconnect()
    }
  }, [ref, read])

  return edges
}
