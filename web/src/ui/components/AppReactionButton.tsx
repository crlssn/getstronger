import type { ComponentProps, ComponentType } from 'react'

import { cn } from '@/ui/cn'
import styles from './AppReactionButton.module.css'

interface Props extends Omit<ComponentProps<'button'>, 'className' | 'type' | 'children'> {
  /** The accessible name: what a tap does now, and the count it would move. */
  label: string
  icon: ComponentType<ComponentProps<'svg'>>
  /** How many people have reacted, shown beside the icon. */
  count: number
  /** Whether this reader is one of them. */
  pressed: boolean
  className?: string
}

/**
 * An icon and a count that turn on and off together.
 *
 * The lightest thing one person can say to another, wherever that is offered.
 * Pressed is a state rather than a colour of its own — `aria-pressed` carries
 * it to a reader who cannot see the fill.
 */
export const AppReactionButton = ({
  label,
  icon: Icon,
  count,
  pressed,
  className,
  ...rest
}: Props) => (
  <button
    type="button"
    className={cn(styles.reaction, pressed ? styles.on : styles.off, className)}
    aria-label={label}
    aria-pressed={pressed}
    {...rest}
  >
    <Icon aria-hidden="true" />
    <span>{count}</span>
  </button>
)
