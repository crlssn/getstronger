import type { ReactNode } from 'react'

import { createPortal } from 'react-dom'

import { usePageNavActionStore } from '@/stores/pageNavAction'

/**
 * Renders its children into the top nav bar's action slot.
 *
 * Nothing happens on a screen with no nav bar above it, which is what lets a
 * screen offer an action without knowing which shell it was opened in.
 */
export const PageNavAction = ({ children }: { children: ReactNode }) => {
  const container = usePageNavActionStore((state) => state.container)

  return container ? createPortal(children, container) : null
}
