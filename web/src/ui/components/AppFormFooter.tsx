import type { ReactNode } from 'react'

import { cn } from '@/ui/cn'
import { useKeyboardOpen } from '@/utils/useKeyboardOpen'
import styles from './AppFormFooter.module.css'

interface Props {
  children: ReactNode
  className?: string
  /** A way out, beside the primary action rather than under it. */
  secondary?: ReactNode
}

/**
 * A form's primary action, pinned above the tab bar.
 *
 * A long form parks its save at the bottom of the scroll, where a routine with
 * ten exercises hides it — and where the tab bar slices it in half. Pinned, it
 * is reachable from anywhere in the form and never underneath anything.
 *
 * Every create and edit screen ends in one of these, so committing an edit
 * looks and lands the same way wherever it is done.
 *
 * It stands down while the on-screen keyboard is up: a bar floating on top of
 * the keyboard covers the field being typed into, and the save is not the
 * action anybody is reaching for mid-word. The spacer keeps the same room in
 * the scroll either way, so the page does not jump as it goes.
 */
export const AppFormFooter = ({ children, className, secondary }: Props) => {
  const keyboardOpen = useKeyboardOpen()

  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      {!keyboardOpen && (
        <div className={cn(styles.footer, className)}>
          <div className={styles.inner}>
            <div className={styles.primary}>{children}</div>
            {secondary}
          </div>
        </div>
      )}
    </>
  )
}
