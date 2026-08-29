import { CheckCircleIcon } from '@heroicons/react/24/outline'
import type { CSSProperties } from 'react'

import { selectBottomChrome, useBottomChrome } from '@/stores/bottomChrome'
import { useToastStore } from '@/stores/toasts'
import styles from './AppToaster.module.css'

/**
 * The transient success message, floating over whichever shell is on screen.
 *
 * Success only: errors render inline where they happened, so the toast never
 * has to interrupt — and it dismisses itself, so it carries no close control.
 * The region is always mounted so a screen reader is watching it before the
 * first message lands, and it lets taps through everywhere the card is not.
 */
export const AppToaster = () => {
  const toast = useToastStore((state) => state.toast)
  const bottomChrome = useBottomChrome(selectBottomChrome)

  return (
    <div
      className={styles.toastRegion}
      // Above whatever is pinned down there rather than a fixed distance off
      // the edge: it used to cover the tab bar on Exercises, and a routine's
      // save and delete on the screen reporting that it had been saved.
      style={{ '--bottom-chrome': `${bottomChrome}px` } as CSSProperties}
    >
      {toast && (
        // Keyed so a new message replaces the card rather than editing it,
        // which is what makes a screen reader announce the second one.
        <div key={toast.id} className={styles.toast} role="status">
          <CheckCircleIcon className={styles.statusIcon} aria-hidden="true" />
          <p>{toast.message}</p>
        </div>
      )}
    </div>
  )
}
