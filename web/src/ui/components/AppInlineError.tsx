import type { ReactNode } from 'react'

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
 */
export const AppInlineError = ({ children, className, id }: Props) => (
  <p role="alert" id={id} className={cn(styles.error, className)}>
    {children}
  </p>
)
