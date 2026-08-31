import type { ReactNode } from 'react'

import { cn } from '@/ui/cn'
import { AppInlineError } from './AppInlineError'
import styles from './AppPreferenceRow.module.css'

interface Props {
  /** What the preference is. */
  title: ReactNode
  /** The line under it: what changing it does. */
  body?: ReactNode
  /** The control that changes it — a switch, a segmented, a stepper. */
  control: ReactNode
  /** Why the last change did not save. */
  error?: string
  className?: string
}

/**
 * A preference and the control that changes it, on one row.
 *
 * A setting applies the moment it is tapped, so a refused change has nowhere
 * to surface but the row it was made on: the control reverts and this line
 * says why, under the copy and still beside the control.
 */
export const AppPreferenceRow = ({ title, body, control, error, className }: Props) => (
  <div className={cn(styles.row, className)}>
    <div className={styles.copy}>
      <strong>{title}</strong>
      {body && <small>{body}</small>}
      {error && <AppInlineError>{error}</AppInlineError>}
    </div>
    <div className={styles.control}>{control}</div>
  </div>
)
