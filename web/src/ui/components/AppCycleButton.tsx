import type { ComponentProps, ComponentType, ReactNode } from 'react'

import { cn } from '@/ui/cn'
import styles from './AppCycleButton.module.css'

interface Props extends Omit<ComponentProps<'button'>, 'className' | 'type' | 'children'> {
  /** The accessible name: the value now, and that a tap changes it. */
  label: string
  icon: ComponentType<ComponentProps<'svg'>>
  /** The value now, beside the icon. */
  children: ReactNode
  /** Filled while the setting is doing something, quiet while it is not. */
  active?: boolean
  className?: string
}

/**
 * A pill that steps to its next value each time it is tapped.
 *
 * For a setting of two or three values that has to change mid-activity: one
 * hand, no sheet, no slider. The value rides on the control rather than behind
 * it, so reading it and changing it are the same glance.
 */
export const AppCycleButton = ({
  label,
  icon: Icon,
  children,
  active = true,
  className,
  ...rest
}: Props) => (
  <button
    type="button"
    className={cn(styles.cycle, active ? styles.on : styles.off, className)}
    aria-label={label}
    {...rest}
  >
    <Icon aria-hidden="true" />
    <span>{children}</span>
  </button>
)
