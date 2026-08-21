import type { Options } from 'sortablejs'

import { useEffect, useRef } from 'react'
import Sortable from 'sortablejs'

interface Config extends Omit<Options, 'onUpdate'> {
  /** Called with the moved item's old and new positions. */
  onReorder: (from: number, to: number) => void
}

/**
 * Makes a list's children draggable, and reports where an item was dropped.
 *
 * Replaces `useSortable` from `@vueuse/integrations`, which has no React
 * equivalent. SortableJS moves the DOM nodes itself, so the caller reorders its
 * own state to match and React re-renders over the top.
 *
 * `onReorder` is held in a ref rather than listed as a dependency: a caller
 * usually passes an inline function, and depending on it would tear the
 * draggable list down and rebuild it on every render.
 */
export const useSortable = <T extends HTMLElement>(
  { onReorder, ...options }: Config,
  enabled = true,
): React.RefObject<T | null> => {
  const list = useRef<T>(null)
  const handler = useRef(onReorder)

  // No dependency array: this runs after every render, so the ref always holds
  // the latest callback.
  useEffect(() => {
    handler.current = onReorder
  })

  const config = useRef(options)

  useEffect(() => {
    const element = list.current
    if (!enabled || !element) return

    const sortable = Sortable.create(element, {
      ...config.current,
      onUpdate: (event) => handler.current(event.oldIndex ?? 0, event.newIndex ?? 0),
    })

    return () => sortable.destroy()
  }, [enabled])

  return list
}
