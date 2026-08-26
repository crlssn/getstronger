import { useEffect, useState } from 'react'

/** How much height the window loses before only a keyboard explains it. */
const keyboardMinimumHeight = 150

/**
 * Whether the on-screen keyboard is covering the bottom of the window.
 *
 * No browser fires an event for it, so it is inferred from the visual viewport
 * losing height that the layout viewport keeps. Anything without a visual
 * viewport — every desktop browser — reports it closed, which is the honest
 * answer there.
 */
export const useKeyboardOpen = (): boolean => {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const read = () => setOpen(window.innerHeight - viewport.height > keyboardMinimumHeight)

    read()
    viewport.addEventListener('resize', read)
    return () => viewport.removeEventListener('resize', read)
  }, [])

  return open
}
