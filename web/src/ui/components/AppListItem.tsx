import type { ComponentProps, ReactNode } from 'react'

import { Link } from 'react-router-dom'

import { cn } from '@/ui/cn'
import styles from './AppListItem.module.css'

interface Props extends ComponentProps<'li'> {
  /** `danger` for a destructive row, `header` for a section label. */
  is?: 'danger' | 'header'
  children: ReactNode
}

/**
 * A row of a list.
 *
 * @deprecated Use `<AppListRow>` instead — same row, fixed slots, and a
 * chevron on every row that navigates. `is="danger"` is `tone="danger"` there,
 * and `is="header"` is `<AppList heading>`. Content that is none of leading,
 * title, meta or trailing is not a list row: it belongs in `<AppOptionRow>`,
 * `<AppPreferenceRow>`, or a widget of its own in ui/features.
 */
export const AppListItem = ({ is, children, className, ...rest }: Props) => (
  <li className={cn(styles.item, is && styles[is], className)} {...rest}>
    {children}
  </li>
)

interface LinkItemProps {
  /** Where the row goes. */
  to: string
  /** Replaces the current history entry rather than pushing one. */
  replace?: boolean
  children: ReactNode
  /** Positions the row. Its own styling is never replaced. */
  className?: string
}

/**
 * A row of a list that is a link.
 *
 * @deprecated Use `<AppListRow to>` instead, which draws the chevron that says
 * the row goes somewhere.
 */
export const AppListItemLink = ({ to, replace, children, className }: LinkItemProps) => (
  <li className={className}>
    <Link className={styles.link} replace={replace} to={to}>
      {children}
    </Link>
  </li>
)
