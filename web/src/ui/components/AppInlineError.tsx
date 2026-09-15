import type { ReactNode } from 'react'

import { useEffect, useRef } from 'react'

import { haptic } from '@/native/haptics'
import { cn } from '@/ui/cn'
import styles from './AppInlineError.module.css'

interface Props {
  /** One or two lines. What failed, said where it happened. */
  children: ReactNode
  className?: string
  id?: string
}

/**
 * An error, rendered beside the action that raised it.
 *
 * Errors do not toast: a toast floats away from the field or button that
 * needs correcting and then dismisses itself. This line sits in the form,
 * sheet or card where the failure happened and stays until it is fixed.
 * `role="alert"` announces it the moment it appears.
 *
 * The phone buzzes it for the same reason and on the same terms: the hand that
 * pressed the button is still on it, and a refusal is the one outcome worth
 * feeling before reading. Every caller clears its error before it retries, so
 * a second failure is a second appearance and buzzes again.
 */
export const AppInlineError = ({ children, className, id }: Props) => {
  const announced = useRef(false)

  useEffect(() => {
    // StrictMode mounts twice and a ref outlives that, so one refusal stays
    // one buzz.
    if (announced.current) return
    announced.current = true

    haptic('actionFailed')
  }, [])

  return (
    <p role="alert" id={id} className={cn(styles.error, className)}>
      {children}
    </p>
  )
}
