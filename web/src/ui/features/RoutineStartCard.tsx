import type { ReactNode } from 'react'

import { PlayIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'

import { cn } from '@/ui/cn'
import styles from './RoutineStartCard.module.css'

interface Props {
  /** The workout this routine starts, which is what the whole card taps to. */
  to: string
  /** What the tap does, for a reader who cannot see the play. */
  label: string
  /** What this routine is here: up next, or one to switch to. */
  eyebrow: ReactNode
  name: string
  /** What it is and how long it takes, on one line. */
  meta: string
  /** Third under a list's group heading, second on a screen without one. */
  headingLevel?: 2 | 3
  /** A routine offered behind the one that is up next, stepped back from it. */
  stepped?: boolean
  onClick?: () => void
  className?: string
}

/**
 * The card that starts a routine: what it is, how long it takes, and a play.
 *
 * The whole card is the tap target, and it reads the same wherever a routine
 * is offered — the dashboard's row, and the top of the training list.
 */
export const RoutineStartCard = ({
  to,
  label,
  eyebrow,
  name,
  meta,
  headingLevel = 2,
  stepped = false,
  onClick,
  className,
}: Props) => {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'

  return (
    <Link
      aria-label={label}
      className={cn(styles.card, stepped && styles.stepped, className)}
      to={to}
      onClick={onClick}
    >
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <Heading>{name}</Heading>
        {/* What it is, how much of it, how long: one line, where three lines
            spread the card down the screen. */}
        <p className={styles.meta}>{meta}</p>
      </div>
      <span aria-hidden="true" className={styles.play}>
        <PlayIcon />
      </span>
    </Link>
  )
}
