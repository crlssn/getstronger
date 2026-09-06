import type { ReactNode } from 'react'

import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'

import { cn } from '@/ui/cn'
import styles from './AppListRow.module.css'

interface Props {
  /** A tile before the copy — a trophy, a number, an avatar. */
  leading?: ReactNode
  title: ReactNode
  /** The line under the title: when it happened, how much, how it is tracked. */
  meta?: ReactNode
  /** A value at the end of the row, read after the title rather than instead of it. */
  trailing?: ReactNode
  /**
   * Where the row goes. A row that navigates always shows the chevron, which
   * is the whole reason this is a prop rather than something the caller draws:
   * the same personal best was a link with one on Progress and a link without
   * one on the profile, and only one of them looked tappable.
   */
  to?: string
  /**
   * `danger` for a row that destroys something. Danger is danger text, never a
   * red fill — the same rule `<AppButton colour="destructive">` follows.
   */
  tone?: 'default' | 'danger'
  className?: string
}

/**
 * A row of a list: a tile, what it is, what it says, and what it is worth.
 *
 * Four screens drew this by hand — the exercise library, the workout history,
 * and the same personal best twice — at two type scales, two paddings and two
 * answers to whether a link shows where it goes.
 *
 * Below 520px the value drops under the title rather than competing with it
 * for the width: on a 390px screen a long exercise name and its heaviest set
 * cannot both have the room they need on one line.
 */
export const AppListRow = ({
  leading,
  title,
  meta,
  trailing,
  to,
  tone = 'default',
  className,
}: Props) => {
  const content = (
    <>
      {leading && <span className={styles.leading}>{leading}</span>}
      {/* Copy and value share one wrapping box rather than two grid columns:
          below 520px the copy takes the full width and the value wraps under
          it, which no amount of column arithmetic has to know about. */}
      <span className={styles.body}>
        <span className={styles.copy}>
          <strong>{title}</strong>
          {meta && <span className={styles.meta}>{meta}</span>}
        </span>
        {trailing && <span className={styles.trailing}>{trailing}</span>}
      </span>
      {to && <ChevronRightIcon className={styles.chevron} aria-hidden="true" />}
    </>
  )

  return (
    <li className={cn(styles.row, tone === 'danger' && styles.danger, className)}>
      {to ? (
        <Link className={styles.inner} to={to}>
          {content}
        </Link>
      ) : (
        <div className={styles.inner}>{content}</div>
      )}
    </li>
  )
}
