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
 *
 * The handle also moves its row with the arrow keys. That is what lets the
 * handle be the only reordering affordance in the app: two screens offered
 * up/down buttons instead, which was a second way to do one thing and two more
 * controls on a row that has little width to spare.
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

    // Dragging is a pointer gesture, so without this the handle is a control
    // a keyboard can reach and not use.
    const onKeyDown = (event: KeyboardEvent) => {
      const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
      if (!step) return

      const selector = config.current.handle
      const target = event.target as HTMLElement | null
      const handle = selector ? target?.closest<HTMLElement>(selector) : undefined
      if (!handle) return

      const rows = [...element.children]
      const from = rows.findIndex((row) => row.contains(handle))
      const to = from + step
      if (from < 0 || to < 0 || to >= rows.length) return

      event.preventDefault()
      handler.current(from, to)

      // The rows are re-rendered in their new order, so the handle under the
      // finger is a different node: focus follows the row that moved.
      requestAnimationFrame(() => {
        element.children[to]?.querySelector<HTMLElement>(selector ?? '')?.focus()
      })
    }

    element.addEventListener('keydown', onKeyDown)

    return () => {
      element.removeEventListener('keydown', onKeyDown)
      sortable.destroy()
    }
  }, [enabled])

  return list
}
