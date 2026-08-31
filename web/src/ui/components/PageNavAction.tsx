import type { ReactNode } from 'react'

import { createPortal } from 'react-dom'

// The one component here that is plumbing rather than a control: it hands a
// screen's action to the shell, and the slot it renders into is the shell's to
// publish. Catalogued here because a screen goes looking for it here.
// eslint-disable-next-line no-restricted-imports
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
