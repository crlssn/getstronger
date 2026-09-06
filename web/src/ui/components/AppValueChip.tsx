import type { ReactNode } from 'react'

import { cn } from '@/ui/cn'
import styles from './AppValueChip.module.css'

interface Props {
  /** The chip's accessible name. A value on its own names nothing. */
  label: string
  /** What the chip reads — a duration, a count, a unit. */
  value: ReactNode
  /**
   * A word before the value, for a row carrying more than one of these.
   *
   * Two rests on the routine builder both read "1:30" and only their
   * accessible names said which was which — one is the rest between an
   * exercise's sets, the other the rest after the whole exercise.
   */
  caption?: string
  /** Whether the control this chip opens is showing. */
  expanded?: boolean
  onClick: () => void
  className?: string
}

/**
 * A value on a row, and the way to the control that changes it.
 *
 * A setting that belongs to a row costs the row a second line to show and a
 * stepper to change, whether or not anybody is tuning it. As a chip it reads at
 * a glance and unfolds its control only when tapped.
 */
export const AppValueChip = ({
  label,
  value,
  caption,
  expanded = false,
  onClick,
  className,
}: Props) => (
  <button
    type="button"
    className={cn(styles.chip, expanded && styles.expanded, className)}
    aria-label={label}
    aria-expanded={expanded}
    onClick={onClick}
  >
    {/* The pill is painted inside the button rather than as it: a chip drawn at
        the tap-target floor reads as a slab beside the name it belongs to. */}
    <span className={styles.pill}>
      {caption && <span className={styles.caption}>{caption}</span>}
      {value}
    </span>
  </button>
)
