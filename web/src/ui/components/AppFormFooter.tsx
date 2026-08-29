import type { ReactNode } from 'react'

import { cloneElement, isValidElement, useId } from 'react'

import { AppInlineError } from '@/ui/components/AppInlineError'
import { cn } from '@/ui/cn'
import { useKeyboardOpen } from '@/utils/useKeyboardOpen'
import { usePinnedHeight } from '@/utils/usePinnedHeight'
import styles from './AppFormFooter.module.css'

interface Props {
  children: ReactNode
  className?: string
  /** A way out, beside the primary action rather than under it. */
  secondary?: ReactNode
  /**
   * What is still missing, for a form whose submit is disabled.
   *
   * Required in the editorial sense rather than the type sense: a blocked
   * submit without one is a control that refuses and will not say why.
   */
  hint?: string
  /**
   * Why the last submit failed, said where the submit lives.
   *
   * Errors render here rather than toasting: the message stays with the
   * button until the retry that clears it.
   */
  error?: string
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
export const AppFormFooter = ({ children, className, secondary, hint, error }: Props) => {
  const keyboardOpen = useKeyboardOpen()
  const hintId = useId()
  // Measured, and only while the bar is drawn: it is 76px with a button in it
  // and 107px once it is also naming what the submit is waiting for, and it
  // stands down entirely while the keyboard is up.
  const pinned = usePinnedHeight('form-footer')

  // The hint is the action's description, not a line that happens to sit above
  // it: a reader who never sees the bar still hears why the button refuses.
  const action =
    hint && isValidElement<{ 'aria-describedby'?: string }>(children)
      ? cloneElement(children, { 'aria-describedby': hintId })
      : children

  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      {!keyboardOpen && (
        <div ref={pinned} className={cn(styles.footer, className)}>
          <div className={styles.inner}>
            {error && <AppInlineError className={styles.errorLine}>{error}</AppInlineError>}
            {hint && (
              <p id={hintId} className={styles.hint}>
                {hint}
              </p>
            )}
            <div className={styles.primary}>{action}</div>
            {secondary}
          </div>
        </div>
      )}
    </>
  )
}
