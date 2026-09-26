import type { ComponentProps, ReactNode } from 'react'

import { haptic } from '@/native/haptics'
import { cn } from '@/ui/cn'
import styles from './AppOptionRow.module.css'

interface Props extends Omit<ComponentProps<'button'>, 'className' | 'type'> {
  children: ReactNode
  /** A tick, a number or an icon tile before the copy. */
  leading?: ReactNode
  /** A chevron or a plus after it. */
  trailing?: ReactNode
  /**
   * Whether the row is chosen.
   *
   * Omit it for a row that picks and closes: only a row that toggles has a
   * state to report, and `aria-pressed="false"` on a row that never stays
   * pressed says the wrong thing.
   */
  selected?: boolean
  /** Drops the border for a row inside an already-divided list. */
  flat?: boolean
  className?: string
}

/**
 * A whole row that is one tap.
 *
 * Four screens wrote this out — a picker, two forms and the home routine
 * sheet — at two heights, with and without a border, and only one of them told
 * a screen reader which row was chosen.
 */
export const AppOptionRow = ({
  children,
  leading,
  trailing,
  selected,
  flat = false,
  className,
  onClick,
  ...rest
}: Props) => (
  <button
    type="button"
    className={cn(styles.row, flat && styles.flat, selected && styles.selected, className)}
    aria-pressed={selected}
    onClick={(event) => {
      // Only an unchosen row with a state changes a value. ponytail: unticking a
      // multi-select row is silent too; add a prop if that should tick.
      if (selected === false) haptic('selection')
      onClick?.(event)
    }}
    {...rest}
  >
    {leading}
    <span className={styles.copy}>{children}</span>
    {trailing}
  </button>
)
